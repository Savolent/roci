import { Effect, Ref, Fiber, Queue } from "effect"
import { FileSystem } from "@effect/platform"
import type { CharacterConfig } from "../services/CharacterFs.js"
import { CharacterFs } from "../services/CharacterFs.js"
import { CharacterLog } from "../logging/log-writer.js"
import {
  logToConsole,
  logPlanTransition,
  logStepResult,
  logTickReceived,
  formatError,
} from "../logging/console-renderer.js"
import type { EventProcessor, EventResult } from "./event-source.js"
import { EventProcessorTag } from "./event-source.js"
import type { SkillRegistry } from "./skill.js"
import { SkillRegistryTag } from "./skill.js"
import type { InterruptRegistry } from "./interrupt.js"
import { InterruptRegistryTag } from "./interrupt.js"
import type { SituationClassifier } from "./situation.js"
import { SituationClassifierTag } from "./situation.js"
import type { StateRenderer } from "./state-renderer.js"
import { StateRendererTag } from "./state-renderer.js"
import type { Plan, StepTiming, Alert } from "./types.js"
import {
  genericBrainPlan,
  genericBrainInterrupt,
  genericBrainEvaluate,
} from "./brain.js"
import { runGenericSubagent } from "./subagent.js"
import * as path from "node:path"

export interface StateMachineConfig<S, Evt> {
  char: CharacterConfig
  containerId: string
  playerName: string
  projectRoot: string
  containerEnv?: Record<string, string>
  events: Queue.Queue<Evt>
  initialState: S
  tickIntervalSec: number
  initialTick: number
}

/**
 * Domain-agnostic plan/act/evaluate state machine.
 * Reads events from a queue, drives the brain + subagent cycle,
 * handles interrupts and timeouts.
 */
export const runStateMachine = <S, Sit, Evt>(config: StateMachineConfig<S, Evt>) =>
  Effect.gen(function* () {
    const eventProcessor = (yield* EventProcessorTag) as EventProcessor<S, Evt>
    const skills = (yield* SkillRegistryTag) as SkillRegistry<S, Sit>
    const interrupts = (yield* InterruptRegistryTag) as InterruptRegistry<S, Sit>
    const classifier = (yield* SituationClassifierTag) as SituationClassifier<S, Sit>
    const renderer = (yield* StateRendererTag) as StateRenderer<S, Sit>
    const charFs = yield* CharacterFs
    const log = yield* CharacterLog

    // --- Brain function instances ---
    const brainPlan = genericBrainPlan<S, Sit>()
    const brainInterrupt = genericBrainInterrupt<S, Sit>()
    const brainEvaluate = genericBrainEvaluate<S, Sit>()

    // --- State refs ---
    const planRef = yield* Ref.make<Plan | null>(null)
    const stepRef = yield* Ref.make(0)
    const subagentFiberRef = yield* Ref.make<Fiber.RuntimeFiber<string, unknown> | null>(null)
    const tickCountRef = yield* Ref.make(config.initialTick)
    const stepStartTickRef = yield* Ref.make(config.initialTick)
    const subagentReportRef = yield* Ref.make("")
    const previousFailureRef = yield* Ref.make<string | null>(null)
    const stepTimingHistoryRef = yield* Ref.make<StepTiming[]>([])
    const lastProcessedTickRef = yield* Ref.make(0)
    const spawnStateRef = yield* Ref.make<Record<string, unknown> | null>(null)
    const tickIntervalSec = config.tickIntervalSec

    // --- Domain state ---
    const gameStateRef = yield* Ref.make<S>(config.initialState)
    const chatContextRef = yield* Ref.make<Array<{ channel: string; sender: string; content: string }>>([])

    // --- Helpers ---

    const killSubagent = Effect.gen(function* () {
      const fiber = yield* Ref.get(subagentFiberRef)
      if (fiber) {
        yield* Fiber.interrupt(fiber).pipe(Effect.catchAll(() => Effect.void))
        yield* Ref.set(subagentFiberRef, null)
      }
    })

    const recordStepTiming = (task: string, goal: string, ticksBudgeted: number) =>
      Effect.gen(function* () {
        const startTick = yield* Ref.get(stepStartTickRef)
        const currentTick = yield* Ref.get(tickCountRef)
        const ticksConsumed = currentTick - startTick
        const overrun = ticksConsumed > ticksBudgeted
        const timing: StepTiming = { task, goal, ticksBudgeted, ticksConsumed, overrun }
        yield* Ref.update(stepTimingHistoryRef, (history) => [...history.slice(-9), timing])
        return timing
      })

    const recordStepOutcome = (succeeded: boolean, reason: string, stateDiffStr: string) =>
      Ref.update(stepTimingHistoryRef, (history) => {
        if (history.length === 0) return history
        const last = { ...history[history.length - 1], succeeded, reason, stateDiff: stateDiffStr }
        return [...history.slice(0, -1), last]
      })

    /** Handle critical interrupts: kill subagent, ask brain for new plan. */
    const handleInterrupt = (criticals: Alert[], state: S, situation: Sit, briefing: string) =>
      Effect.gen(function* () {
        yield* logToConsole(config.char.name, "monitor", `INTERRUPT: ${criticals.map((a) => a.message).join("; ")}`)

        yield* log.thought(config.char, {
          timestamp: new Date().toISOString(),
          source: "monitor",
          character: config.char.name,
          type: "interrupt",
          alerts: criticals,
          action: "killing subagent, replanning",
        })

        yield* killSubagent

        const background = yield* charFs.readBackground(config.char)
        const newPlan = yield* brainInterrupt.execute({
          state,
          situation,
          alerts: criticals,
          currentPlan: yield* Ref.get(planRef),
          briefing,
          background,
        })

        yield* log.thought(config.char, {
          timestamp: new Date().toISOString(),
          source: "brain",
          character: config.char.name,
          type: "interrupt_plan",
          plan: newPlan,
        })

        yield* logToConsole(config.char.name, "brain", `Interrupt plan: ${newPlan.reasoning}`)

        const tickCount = yield* Ref.get(tickCountRef)
        yield* Ref.set(planRef, newPlan)
        yield* Ref.set(stepRef, 0)
        yield* Ref.set(stepStartTickRef, tickCount)
      })

    /** Check if a completed subagent's step succeeded. Advance or replan. */
    const evaluateCompletedSubagent = (state: S) =>
      Effect.gen(function* () {
        const plan = yield* Ref.get(planRef)
        const step = yield* Ref.get(stepRef)

        if (plan && step < plan.steps.length) {
          const currentStep = plan.steps[step]
          const timing = yield* recordStepTiming(currentStep.task, currentStep.goal, currentStep.timeoutTicks)
          const report = yield* Ref.get(subagentReportRef)

          // Build state diff from spawn-time snapshot
          const stateBefore = yield* Ref.get(spawnStateRef)
          const stateAfter = renderer.richSnapshot(state)
          const diffStr = renderer.stateDiff(stateBefore, stateAfter)

          // Run deterministic condition check
          const situation = classifier.classify(state)
          const conditionCheck = skills.isStepComplete(currentStep, state, situation)

          // Short-circuit: if deterministic check passes with a recognized condition, skip LLM
          if (conditionCheck.complete && conditionCheck.matchedCondition) {
            yield* recordStepOutcome(true, conditionCheck.reason, diffStr)
            yield* logStepResult(config.char.name, step, conditionCheck)
            yield* log.action(config.char, {
              timestamp: new Date().toISOString(),
              source: "monitor",
              character: config.char.name,
              type: "step_complete",
              stepIndex: step,
              task: currentStep.task,
              goal: currentStep.goal,
              successCondition: currentStep.successCondition,
              successConditionMet: true,
              reason: `[deterministic] ${conditionCheck.reason}`,
              stateSnapshot: conditionCheck.relevantState,
              stateDiff: diffStr,
              subagentReport: report.slice(-500),
            })

            yield* Ref.set(stepRef, step + 1)
            yield* Ref.set(subagentFiberRef, null)
            yield* Ref.set(subagentReportRef, "")
            yield* Ref.set(spawnStateRef, null)
            return
          }

          const result = yield* brainEvaluate.execute({
            step: currentStep,
            subagentReport: report,
            state,
            stateBefore,
            stateDiff: diffStr,
            conditionCheck,
            ticksConsumed: timing.ticksConsumed,
            ticksBudgeted: timing.ticksBudgeted,
            tickIntervalSec,
          }).pipe(
            Effect.catchAll((e) =>
              Effect.succeed({
                complete: true as const,
                reason: `Brain evaluation failed (${e}), trusting subagent completion`,
                matchedCondition: null,
                relevantState: renderer.snapshot(state),
              }),
            ),
          )

          yield* recordStepOutcome(result.complete, result.reason, diffStr)
          yield* logStepResult(config.char.name, step, result)

          yield* log.action(config.char, {
            timestamp: new Date().toISOString(),
            source: "monitor",
            character: config.char.name,
            type: "step_complete",
            stepIndex: step,
            task: currentStep.task,
            goal: currentStep.goal,
            successCondition: currentStep.successCondition,
            successConditionMet: result.complete,
            reason: result.reason,
            stateSnapshot: result.relevantState,
            subagentReport: report.slice(-500),
          })

          if (result.complete) {
            yield* Ref.set(stepRef, step + 1)
          } else {
            const failureContext = `Step ${step + 1} [${currentStep.task}] "${currentStep.goal}" failed: ${result.reason}\nSubagent report: ${report.slice(-300) || "(no report)"}`
            yield* Ref.set(previousFailureRef, failureContext)
            yield* Ref.set(planRef, null)
            yield* Ref.set(stepRef, 0)
          }
        }

        yield* Ref.set(subagentFiberRef, null)
        yield* Ref.set(subagentReportRef, "")
        yield* Ref.set(spawnStateRef, null)
      })

    /** Check mid-run step completion and timeouts. */
    const checkMidRun = (state: S, situation: Sit) =>
      Effect.gen(function* () {
        const currentFiber = yield* Ref.get(subagentFiberRef)
        if (!currentFiber) return

        const plan = yield* Ref.get(planRef)
        const step = yield* Ref.get(stepRef)
        const startTick = yield* Ref.get(stepStartTickRef)
        const tickCount = yield* Ref.get(tickCountRef)

        if (plan && step < plan.steps.length) {
          const currentStep = plan.steps[step]

          const midRunResult = skills.isStepComplete(currentStep, state, situation)
          if (midRunResult.complete) {
            yield* recordStepTiming(currentStep.task, currentStep.goal, currentStep.timeoutTicks)
            yield* Fiber.interrupt(currentFiber).pipe(Effect.catchAll(() => Effect.void))
            yield* Ref.set(subagentFiberRef, null)
            yield* Ref.set(stepRef, step + 1)
          } else if (tickCount - startTick >= currentStep.timeoutTicks) {
            yield* recordStepTiming(currentStep.task, currentStep.goal, currentStep.timeoutTicks)
            yield* Fiber.interrupt(currentFiber).pipe(Effect.catchAll(() => Effect.void))
            yield* Ref.set(subagentFiberRef, null)
            yield* Ref.set(stepRef, step + 1)
          }
        }
      })

    /** Request a new plan from the brain if needed. */
    const maybeRequestPlan = (state: S, situation: Sit, briefing: string) =>
      Effect.gen(function* () {
        const plan = yield* Ref.get(planRef)
        const step = yield* Ref.get(stepRef)
        const noFiber = (yield* Ref.get(subagentFiberRef)) === null

        if (noFiber && (!plan || step >= (plan?.steps.length ?? 0))) {
          const diary = yield* charFs.readDiary(config.char)
          const background = yield* charFs.readBackground(config.char)
          const values = yield* charFs.readValues(config.char)
          const previousFailure = yield* Ref.get(previousFailureRef)
          const recentChat = yield* Ref.get(chatContextRef)
          const stepTimingHistory = yield* Ref.get(stepTimingHistoryRef)

          const newPlan = yield* brainPlan.execute({
            state,
            situation,
            diary,
            briefing,
            background,
            values,
            previousFailure: previousFailure ?? undefined,
            recentChat: recentChat.length > 0 ? recentChat : undefined,
            stepTimingHistory: stepTimingHistory.length > 0 ? stepTimingHistory : undefined,
            tickIntervalSec,
          })

          yield* Ref.set(previousFailureRef, null)
          yield* Ref.set(chatContextRef, [])

          yield* log.thought(config.char, {
            timestamp: new Date().toISOString(),
            source: "brain",
            character: config.char.name,
            type: "plan",
            plan: newPlan,
            reasoning: newPlan.reasoning,
          })

          yield* logToConsole(
            config.char.name,
            "brain",
            `New plan (${newPlan.steps.length} steps): ${newPlan.reasoning}`,
          )

          const tickCount = yield* Ref.get(tickCountRef)
          yield* Ref.set(planRef, newPlan)
          yield* Ref.set(stepRef, 0)
          yield* Ref.set(stepStartTickRef, tickCount)
        }
      })

    /** Spawn a subagent for the current plan step if needed. */
    const maybeSpawnSubagent = (state: S, situation: Sit) =>
      Effect.gen(function* () {
        if ((yield* Ref.get(subagentFiberRef)) !== null) return

        const currentPlan = yield* Ref.get(planRef)
        const currentStep = yield* Ref.get(stepRef)

        if (currentPlan && currentStep < currentPlan.steps.length) {
          const planStep = currentPlan.steps[currentStep]

          yield* logPlanTransition(config.char.name, currentPlan, currentStep)

          const personality = yield* charFs.readBackground(config.char)
          const values = yield* charFs.readValues(config.char)
          const fs = yield* FileSystem.FileSystem
          const systemPrompt = yield* fs.readFileString(
            path.resolve(config.projectRoot, "in-game-CLAUDE.md"),
          ).pipe(Effect.catchAll(() => Effect.succeed("")))

          const fiber = yield* runGenericSubagent({
            char: config.char,
            containerId: config.containerId,
            playerName: config.playerName,
            systemPrompt,
            containerEnv: config.containerEnv,
            step: planStep,
            state,
            situation,
            personality,
            values,
            tickIntervalSec: config.tickIntervalSec,
          }).pipe(
            Effect.tap((report) => Ref.set(subagentReportRef, report)),
            Effect.catchAll((e) =>
              Effect.gen(function* () {
                const msg = formatError(e)
                yield* Ref.set(subagentReportRef, `[SUBAGENT ERROR] ${msg}`)
                yield* logToConsole(config.char.name, "error", msg)
                return ""
              }),
            ),
            Effect.fork,
          )

          const tickCount = yield* Ref.get(tickCountRef)
          yield* Ref.set(subagentFiberRef, fiber)
          yield* Ref.set(stepStartTickRef, tickCount)
          yield* Ref.set(spawnStateRef, renderer.richSnapshot(state))
        }
      })

    // --- Main event processing ---

    /** Process a state update: the core decision cycle. */
    const handleStateUpdateEvent = (state: S) =>
      Effect.gen(function* () {
        const situation = classifier.classify(state)
        const briefing = classifier.briefing(state, situation)

        renderer.logStateBar(config.char.name, state, situation)

        // Check for interrupts
        const criticals = interrupts.criticals(state, situation)
        if (criticals.length > 0) {
          yield* handleInterrupt(criticals, state, situation, briefing)
        }

        // Check if subagent finished
        const currentFiber = yield* Ref.get(subagentFiberRef)
        if (currentFiber) {
          const poll = yield* Fiber.poll(currentFiber)
          if (poll._tag === "Some") {
            yield* evaluateCompletedSubagent(state)
          }
        }

        // Plan + spawn cycle
        yield* maybeRequestPlan(state, situation, briefing)
        yield* maybeSpawnSubagent(state, situation)
      })

    /** Process a tick: heartbeat, timeout checks, and proactive plan/spawn. */
    const handleTickEvent = (tick: number) =>
      Effect.gen(function* () {
        yield* logTickReceived(config.char.name, tick)
        yield* Ref.set(lastProcessedTickRef, tick)
        yield* Ref.set(tickCountRef, tick)

        const state = yield* Ref.get(gameStateRef)
        const situation = classifier.classify(state)
        const briefing = classifier.briefing(state, situation)

        yield* checkMidRun(state, situation)

        const currentFiber = yield* Ref.get(subagentFiberRef)
        if (currentFiber) {
          const poll = yield* Fiber.poll(currentFiber)
          if (poll._tag === "Some") {
            yield* evaluateCompletedSubagent(state)
          }
        }

        yield* maybeRequestPlan(state, situation, briefing)
        yield* maybeSpawnSubagent(state, situation)
      })

    /** Process a reset event (e.g. death): kill everything, start fresh. */
    const handleReset = () =>
      Effect.gen(function* () {
        yield* killSubagent
        yield* Ref.set(planRef, null)
        yield* Ref.set(stepRef, 0)
      })

    // --- Event loop ---

    yield* logToConsole(config.char.name, "monitor", "Starting event loop (WebSocket-driven)...")

    // Initial planning on startup
    yield* Effect.gen(function* () {
      const state = yield* Ref.get(gameStateRef)
      const situation = classifier.classify(state)
      const briefing = classifier.briefing(state, situation)
      yield* maybeRequestPlan(state, situation, briefing)
      yield* maybeSpawnSubagent(state, situation)
    }).pipe(
      Effect.catchAllCause((cause) => {
        const msg = cause.toString().slice(0, 500)
        return logToConsole(config.char.name, "error", `Initial planning error: ${msg}`)
      }),
    )

    yield* Effect.forever(
      Effect.gen(function* () {
        const event = yield* Queue.take(config.events)

        // Process event through the domain event processor
        const result: EventResult<S> = eventProcessor.processEvent(
          event,
          yield* Ref.get(gameStateRef),
        )

        // Apply state update if present
        if (result.stateUpdate) {
          yield* Ref.update(gameStateRef, result.stateUpdate)
        }

        // Update tick if present
        if (result.tick !== undefined) {
          yield* Ref.set(tickCountRef, result.tick)
        }

        // Run logging side effect
        if (result.log) {
          result.log()
        }

        // Accumulate context (e.g. chat messages)
        if (result.accumulatedContext) {
          if (result.accumulatedContext.chatMessage) {
            const msg = result.accumulatedContext.chatMessage as { channel: string; sender: string; content: string }
            yield* Ref.update(chatContextRef, (msgs) => {
              const updated = [...msgs, msg]
              return updated.slice(-20)
            })
            yield* logToConsole(config.char.name, "ws:chat",
              `[${msg.channel}] ${msg.sender}: ${msg.content}`)
            yield* log.word(config.char, {
              timestamp: new Date().toISOString(),
              source: "ws",
              character: config.char.name,
              type: "chat_received",
              ...msg,
            })
          }
          if (result.accumulatedContext.combatUpdate) {
            const p = result.accumulatedContext.combatUpdate as { attacker: string; target: string; damage: number; destroyed?: boolean }
            yield* logToConsole(config.char.name, "ws:combat",
              `${p.attacker} -> ${p.target}: ${p.damage} dmg${p.destroyed ? " [DESTROYED]" : ""}`)
            yield* log.action(config.char, {
              timestamp: new Date().toISOString(),
              source: "ws",
              character: config.char.name,
              type: "combat_update",
              ...p,
            })
          }
          if (result.accumulatedContext.deathEvent) {
            const d = result.accumulatedContext.deathEvent as { killer_name: string; cause: string; respawn_base: string }
            yield* logToConsole(config.char.name, "ws:death",
              `Killed by ${d.killer_name}: ${d.cause}. Respawning at ${d.respawn_base}`)
          }
          if (result.accumulatedContext.error) {
            const e = result.accumulatedContext.error as { code: string; message: string }
            yield* logToConsole(config.char.name, "ws:error", `[${e.code}] ${e.message}`)
          }
        }

        // Handle the different event result types
        yield* Effect.gen(function* () {
          if (result.isReset) {
            yield* handleReset()
            return
          }

          if (result.isInterrupt) {
            const plan = yield* Ref.get(planRef)
            const currentStep = yield* Ref.get(stepRef)
            const currentTask = plan && currentStep < plan.steps.length ? plan.steps[currentStep].task : undefined

            const state = yield* Ref.get(gameStateRef)
            const situation = classifier.classify(state)

            // Build alerts: prefer synthetic combat update alert if available, otherwise use registry
            const combatUpdate = result.accumulatedContext?.combatUpdate as { attacker: string; target: string; damage: number } | undefined
            const alerts: Alert[] = combatUpdate
              ? (currentTask === "combat" ? [] : [{
                  priority: "critical",
                  message: `Combat: ${combatUpdate.attacker} attacking ${combatUpdate.target} for ${combatUpdate.damage} damage`,
                  suggestedAction: "Assess threat and respond",
                }])
              : interrupts.criticals(state, situation, currentTask)
            if (alerts.length > 0) {
              const briefing = classifier.briefing(state, situation)
              yield* handleInterrupt(alerts, state, situation, briefing)
            }
            return
          }

          if (result.isStateUpdate) {
            const state = yield* Ref.get(gameStateRef)
            yield* handleStateUpdateEvent(state)
            return
          }

          if (result.isTick && result.tick !== undefined) {
            yield* handleTickEvent(result.tick)
            return
          }
        }).pipe(
          Effect.catchAll((e) => {
            const msg = formatError(e)
            return logToConsole(config.char.name, "error", `Event processing error: ${msg}`)
          }),
        )
      }),
    )
  })
