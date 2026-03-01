import { Effect } from "effect"
import { Claude, ClaudeError } from "../services/Claude.js"
import type { AiFunction } from "./AiFunction.js"
import type { DomainAdapter } from "./domain.js"
import type { Plan, PlanStep, StepCompletionResult, StepTiming, Alert } from "./types.js"

// ── Plan parsing ────────────────────────────────────────────

function parsePlan(output: string): Plan {
  let json = output.trim()
  const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    json = fenceMatch[1]
  }
  const parsed = JSON.parse(json)
  return {
    reasoning: parsed.reasoning ?? "",
    steps: Array.isArray(parsed.steps)
      ? parsed.steps.map((s: Record<string, unknown>) => ({
          task: (s.task as string) ?? "explore",
          goal: (s.goal as string) ?? "",
          model: (s.model as "haiku" | "sonnet") ?? "haiku",
          successCondition: (s.successCondition as string) ?? "",
          timeoutTicks: (s.timeoutTicks as number) ?? 10,
        }))
      : [],
  }
}

// ── Generic brain functions ─────────────────────────────────

export interface GenericBrainPlanInput<S, Sit> {
  adapter: DomainAdapter<S, Sit>
  state: S
  situation: Sit
  diary: string
  briefing: string
  background: string
  values: string
  previousFailure?: string
  recentChat?: Array<{ channel: string; sender: string; content: string }>
  stepTimingHistory?: StepTiming[]
  tickIntervalSec: number
}

export interface GenericBrainInterruptInput<S, Sit> {
  adapter: DomainAdapter<S, Sit>
  state: S
  situation: Sit
  alerts: Alert[]
  currentPlan: Plan | null
  briefing: string
  background: string
}

export interface GenericBrainEvaluateInput<S, Sit> {
  adapter: DomainAdapter<S, Sit>
  step: PlanStep
  subagentReport: string
  state: S
  stateBefore: Record<string, unknown> | null
  stateDiff: string
  conditionCheck: StepCompletionResult
  ticksConsumed: number
  ticksBudgeted: number
  tickIntervalSec: number
}

export const genericBrainPlan = <S, Sit>(): AiFunction<GenericBrainPlanInput<S, Sit>, Plan, Claude, ClaudeError> => ({
  name: "brain.plan",
  execute: (input) =>
    Effect.gen(function* () {
      const claude = yield* Claude

      const systemPrompt = input.adapter.planSystemPrompt({ tickIntervalSec: input.tickIntervalSec })
      const userPrompt = input.adapter.planUserPrompt(input)

      const output = yield* claude.invoke({
        prompt: userPrompt,
        model: "opus",
        systemPrompt,
        outputFormat: "text",
        maxTurns: 1,
      })

      try {
        return parsePlan(output)
      } catch (e) {
        return yield* Effect.fail(
          new ClaudeError(`Failed to parse brain plan output: ${e}`, output),
        )
      }
    }),
})

export const genericBrainInterrupt = <S, Sit>(): AiFunction<GenericBrainInterruptInput<S, Sit>, Plan, Claude, ClaudeError> => ({
  name: "brain.interrupt",
  execute: (input) =>
    Effect.gen(function* () {
      const claude = yield* Claude

      const systemPrompt = input.adapter.interruptSystemPrompt()
      const userPrompt = input.adapter.interruptUserPrompt(input)

      const output = yield* claude.invoke({
        prompt: userPrompt,
        model: "opus",
        systemPrompt,
        outputFormat: "text",
        maxTurns: 1,
      })

      try {
        return parsePlan(output)
      } catch (e) {
        return yield* Effect.fail(
          new ClaudeError(`Failed to parse brain interrupt output: ${e}`, output),
        )
      }
    }),
})

export const genericBrainEvaluate = <S, Sit>(): AiFunction<GenericBrainEvaluateInput<S, Sit>, StepCompletionResult, Claude, ClaudeError> => ({
  name: "brain.evaluate",
  execute: (input) =>
    Effect.gen(function* () {
      const claude = yield* Claude

      const systemPrompt = input.adapter.evaluateSystemPrompt()
      const userPrompt = input.adapter.evaluateUserPrompt(input)

      const output = yield* claude.invoke({
        prompt: userPrompt,
        model: "opus",
        systemPrompt,
        outputFormat: "text",
        maxTurns: 1,
      })

      let json = output.trim()
      const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (fenceMatch) {
        json = fenceMatch[1]
      }
      const parsed = JSON.parse(json)
      const stateSnapshot = input.adapter.snapshot(input.state)

      return {
        complete: parsed.complete as boolean,
        reason: parsed.reason as string,
        matchedCondition: null,
        relevantState: stateSnapshot,
      } satisfies StepCompletionResult
    }),
})
