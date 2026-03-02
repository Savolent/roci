import { Context } from "effect"

/**
 * All state-to-human-readable transformations.
 * Used by brain functions for prompt context and by the state machine
 * for logging/diffs.
 *
 * @typeParam S — Domain state
 * @typeParam Sit — Structured situation
 */
export interface StateRenderer<S = unknown, Sit = unknown> {
  /** Compact snapshot for logging. */
  snapshot(state: S): Record<string, unknown>
  /** Rich snapshot (includes breakdown data + tick) for diff tracking. */
  richSnapshot(state: S): Record<string, unknown>
  /** Human-readable diff between two rich snapshots. */
  stateDiff(before: Record<string, unknown> | null, after: Record<string, unknown>): string
  /** Render domain state for planning context. */
  renderForPlanning(state: S, situation: Sit): string
  /** Compact console output line per tick. */
  logStateBar(name: string, state: S, situation: Sit): void
}

/**
 * Effect service tag for the state renderer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- type erasure for Effect DI; recovered via cast in state-machine
export class StateRendererTag extends Context.Tag("StateRenderer")<StateRendererTag, StateRenderer<any, any>>() {}
