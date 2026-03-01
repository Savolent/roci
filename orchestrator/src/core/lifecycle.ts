import { Context, Effect } from "effect"
import type { Plan, StepCompletionResult } from "./types.js"

/**
 * Hooks that let phases observe and influence the state machine lifecycle.
 * All hooks are optional — when absent, the state machine behaves exactly
 * as before (infinite loop, no callbacks).
 */
export interface LifecycleHooks {
  /** Called before the brain requests a new plan. */
  readonly beforePlan?: () => Effect.Effect<void>
  /** Called after a plan has been produced by the brain. */
  readonly afterPlan?: (plan: Plan) => Effect.Effect<void>
  /** Called before a subagent is spawned for a step. */
  readonly beforeStep?: (stepIndex: number, task: string) => Effect.Effect<void>
  /** Called after a step has been evaluated (success or failure). */
  readonly afterStep?: (stepIndex: number, result: StepCompletionResult) => Effect.Effect<void>
  /** Called when an interrupt is processed. */
  readonly onInterrupt?: (alerts: Array<{ priority: string; message: string }>) => Effect.Effect<void>
  /**
   * Called after each event iteration.
   * Return true to signal the state machine should exit.
   */
  readonly shouldExit?: () => Effect.Effect<boolean>
}

export class LifecycleHooksTag extends Context.Tag("LifecycleHooks")<
  LifecycleHooksTag,
  LifecycleHooks
>() {}
