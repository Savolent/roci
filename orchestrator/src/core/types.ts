/**
 * Domain-agnostic types for the plan/act/evaluate loop.
 */

export interface Plan {
  steps: PlanStep[]
  reasoning: string
}

export interface PlanStep {
  task: string       // e.g. "mine", "travel", "sell", "dock", "refuel", "chat", "explore"
  goal: string       // NL goal for the subagent
  model: "haiku" | "sonnet"
  successCondition: string  // checked against game state
  timeoutTicks: number
}

export interface StepCompletionResult {
  complete: boolean
  reason: string
  matchedCondition: string | null
  relevantState: Record<string, unknown>
}

export interface StepTiming {
  task: string
  goal: string
  ticksBudgeted: number
  ticksConsumed: number
  overrun: boolean
  // Outcome fields — filled after evaluation
  succeeded?: boolean
  reason?: string
  stateDiff?: string
}

export interface Alert {
  priority: "critical" | "high" | "medium" | "low"
  message: string
  suggestedAction?: string
}
