import { Context, Effect } from "effect"
import type { Plan, PlanStep, StepCompletionResult } from "./types.js"

/**
 * Context passed to the beforePlan hook.
 * Intentionally avoids generic S/Sit — hooks inject string context,
 * not typed state.
 */
export interface PlanContext {
  briefing: string
  state: unknown
  situation: unknown
  diary: string
  previousFailure?: string
}

/**
 * Hooks that let phases observe and influence the state machine lifecycle.
 * All hooks are optional — when absent, the state machine behaves exactly
 * as before (infinite loop, no callbacks).
 *
 * Transform hooks receive data and return (possibly modified) data.
 * The state machine uses the returned value instead of the original.
 */
export interface LifecycleHooks {
  /** Called before the brain requests a new plan. Returns enrichment for the brain. */
  readonly beforePlan?: (ctx: PlanContext) => Effect.Effect<{ additionalContext?: string }>
  /** Called after a plan has been produced by the brain. Returns (possibly modified) plan. */
  readonly afterPlan?: (plan: Plan) => Effect.Effect<Plan>
  /** Called before a subagent is spawned for a step. Returns (possibly modified) step. */
  readonly beforeStep?: (stepIndex: number, step: PlanStep) => Effect.Effect<PlanStep>
  /** Called after a step has been evaluated (success or failure). Returns (possibly modified) result. */
  readonly afterStep?: (stepIndex: number, result: StepCompletionResult) => Effect.Effect<StepCompletionResult>
  /** Called when an interrupt is processed. Observe-only. */
  readonly onInterrupt?: (alerts: Array<{ priority: string; message: string }>) => Effect.Effect<void>
  /**
   * Called after each event iteration.
   * Receives the current turn count for informed decisions.
   * Return true to signal the state machine should exit.
   */
  readonly shouldExit?: (turnCount: number) => Effect.Effect<boolean>
}

export class LifecycleHooksTag extends Context.Tag("LifecycleHooks")<
  LifecycleHooksTag,
  LifecycleHooks
>() {}

/**
 * Compose multiple LifecycleHooks into a single set of hooks.
 * - Transform hooks (afterPlan, beforeStep, afterStep): pipe output of each into the next.
 * - beforePlan: merge additionalContext strings from all hooks (join with newlines).
 * - shouldExit: OR — any hook returning true triggers exit.
 * - onInterrupt: run all in sequence.
 */
export const composeHooks = (...hookSets: LifecycleHooks[]): LifecycleHooks => {
  const beforePlans = hookSets.map((h) => h.beforePlan).filter(Boolean)
  const afterPlans = hookSets.map((h) => h.afterPlan).filter(Boolean)
  const beforeSteps = hookSets.map((h) => h.beforeStep).filter(Boolean)
  const afterSteps = hookSets.map((h) => h.afterStep).filter(Boolean)
  const onInterrupts = hookSets.map((h) => h.onInterrupt).filter(Boolean)
  const shouldExits = hookSets.map((h) => h.shouldExit).filter(Boolean)

  return {
    beforePlan: beforePlans.length > 0
      ? (ctx) =>
          Effect.gen(function* () {
            const parts: string[] = []
            for (const hook of beforePlans) {
              const result = yield* hook!(ctx)
              if (result.additionalContext) {
                parts.push(result.additionalContext)
              }
            }
            return { additionalContext: parts.length > 0 ? parts.join("\n") : undefined }
          })
      : undefined,

    afterPlan: afterPlans.length > 0
      ? (plan) =>
          Effect.gen(function* () {
            let current = plan
            for (const hook of afterPlans) {
              current = yield* hook!(current)
            }
            return current
          })
      : undefined,

    beforeStep: beforeSteps.length > 0
      ? (stepIndex, step) =>
          Effect.gen(function* () {
            let current = step
            for (const hook of beforeSteps) {
              current = yield* hook!(stepIndex, current)
            }
            return current
          })
      : undefined,

    afterStep: afterSteps.length > 0
      ? (stepIndex, result) =>
          Effect.gen(function* () {
            let current = result
            for (const hook of afterSteps) {
              current = yield* hook!(stepIndex, current)
            }
            return current
          })
      : undefined,

    onInterrupt: onInterrupts.length > 0
      ? (alerts) =>
          Effect.gen(function* () {
            for (const hook of onInterrupts) {
              yield* hook!(alerts)
            }
          })
      : undefined,

    shouldExit: shouldExits.length > 0
      ? (turnCount) =>
          Effect.gen(function* () {
            for (const hook of shouldExits) {
              if (yield* hook!(turnCount)) return true
            }
            return false
          })
      : undefined,
  }
}
