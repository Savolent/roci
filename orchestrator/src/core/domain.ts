import type { Plan, PlanStep, StepCompletionResult, StepTiming, Alert } from "./types.js"

/**
 * The main integration point between the domain-agnostic state machine
 * and a specific domain (game, coding agent, trading bot, etc.).
 *
 * @typeParam S — Domain state (e.g. GameState)
 * @typeParam Sit — Structured situation derived from state (e.g. Situation)
 */
export interface DomainAdapter<S, Sit> {
  /** Derive structured situation from raw state. */
  classify(state: S): Sit

  /** Which alerts warrant killing the current subagent. */
  detectInterrupts(situation: Sit): Alert[]

  /** Human-readable context string for the brain. */
  briefing(state: S, situation: Sit): string

  /** Compact snapshot for logging. */
  snapshot(state: S): Record<string, unknown>

  /** Rich snapshot (includes breakdown data + tick) for diff tracking. */
  richSnapshot(state: S): Record<string, unknown>

  /** Human-readable diff between two rich snapshots. */
  stateDiff(before: Record<string, unknown> | null, after: Record<string, unknown>): string

  /** Deterministic check: is this plan step complete? */
  isStepComplete(step: PlanStep, state: S, situation: Sit): StepCompletionResult

  /** System prompt for the planning brain. */
  planSystemPrompt(ctx: { tickIntervalSec: number }): string

  /** System prompt for evaluation. */
  evaluateSystemPrompt(): string

  /** System prompt for interrupt replanning. */
  interruptSystemPrompt(): string

  /** Build the user-facing prompt for planning. */
  planUserPrompt(ctx: {
    state: S
    situation: Sit
    briefing: string
    diary: string
    background: string
    values: string
    previousFailure?: string
    recentChat?: Array<{ channel: string; sender: string; content: string }>
    stepTimingHistory?: StepTiming[]
    tickIntervalSec: number
  }): string

  /** Build the user-facing prompt for interrupt replanning. */
  interruptUserPrompt(ctx: {
    state: S
    situation: Sit
    alerts: Alert[]
    currentPlan: Plan | null
    briefing: string
    background: string
  }): string

  /** Build the user-facing prompt for step evaluation. */
  evaluateUserPrompt(ctx: {
    step: PlanStep
    subagentReport: string
    state: S
    stateBefore: Record<string, unknown> | null
    stateDiff: string
    conditionCheck: StepCompletionResult
    ticksConsumed: number
    ticksBudgeted: number
    tickIntervalSec: number
  }): string

  /** Build the full prompt sent to the subagent for a given step. */
  subagentPrompt(step: PlanStep, state: S, situation: Sit, identity: {
    personality: string
    values: string
    tickIntervalSec: number
  }): string

  /** Render domain state for planning context (embedded in planning prompt). */
  renderStateForPlanning(state: S, situation: Sit): string

  /** Compact console output line per tick. */
  logStateBar(name: string, state: S, situation: Sit): void
}
