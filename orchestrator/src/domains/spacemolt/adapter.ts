import type { DomainAdapter } from "../../core/domain.js"
import type { Plan, PlanStep, StepCompletionResult, StepTiming, Alert } from "../../core/types.js"
import type { GameState, Situation } from "./types.js"
import { classifySituation } from "../../../../harness/src/situation/classifier.js"
import { detectAlerts } from "../../../../harness/src/situation/alerts.js"
import { generateBriefing } from "../../../../harness/src/context/briefing.js"
import { isStepComplete } from "./step-matchers.js"
import { snapshot, richSnapshot, stateDiff, logStateBar } from "./state-renderer.js"
import {
  buildPlanSystemPrompt,
  buildPlanUserPrompt,
  INTERRUPT_SYSTEM_PROMPT,
  buildInterruptUserPrompt,
  EVALUATE_SYSTEM_PROMPT,
  buildEvaluateUserPrompt,
  buildSubagentPrompt,
} from "./prompts.js"

/**
 * SpaceMolt domain adapter: implements DomainAdapter for the SpaceMolt MMO.
 */
export class SpaceMoltAdapter implements DomainAdapter<GameState, Situation> {
  classify(state: GameState): Situation {
    const situation = classifySituation(state)
    situation.alerts = detectAlerts(state, situation)
    return situation
  }

  detectInterrupts(situation: Situation): Alert[] {
    return situation.alerts.filter((a) => a.priority === "critical")
  }

  briefing(state: GameState, situation: Situation): string {
    return generateBriefing(state, situation)
  }

  snapshot(state: GameState): Record<string, unknown> {
    return snapshot(state)
  }

  richSnapshot(state: GameState): Record<string, unknown> {
    return richSnapshot(state)
  }

  stateDiff(before: Record<string, unknown> | null, after: Record<string, unknown>): string {
    return stateDiff(before, after)
  }

  isStepComplete(step: PlanStep, state: GameState, situation: Situation): StepCompletionResult {
    return isStepComplete(step, state, situation)
  }

  planSystemPrompt(ctx: { tickIntervalSec: number }): string {
    return buildPlanSystemPrompt(ctx.tickIntervalSec)
  }

  evaluateSystemPrompt(): string {
    return EVALUATE_SYSTEM_PROMPT
  }

  interruptSystemPrompt(): string {
    return INTERRUPT_SYSTEM_PROMPT
  }

  planUserPrompt(ctx: {
    state: GameState
    situation: Situation
    briefing: string
    diary: string
    background: string
    values: string
    previousFailure?: string
    recentChat?: Array<{ channel: string; sender: string; content: string }>
    stepTimingHistory?: StepTiming[]
    tickIntervalSec: number
  }): string {
    return buildPlanUserPrompt(ctx)
  }

  interruptUserPrompt(ctx: {
    state: GameState
    situation: Situation
    alerts: Alert[]
    currentPlan: Plan | null
    briefing: string
    background: string
  }): string {
    return buildInterruptUserPrompt(ctx)
  }

  evaluateUserPrompt(ctx: {
    step: PlanStep
    subagentReport: string
    state: GameState
    stateBefore: Record<string, unknown> | null
    stateDiff: string
    conditionCheck: StepCompletionResult
    ticksConsumed: number
    ticksBudgeted: number
    tickIntervalSec: number
  }): string {
    return buildEvaluateUserPrompt(ctx)
  }

  subagentPrompt(step: PlanStep, state: GameState, situation: Situation, identity: {
    personality: string
    values: string
    tickIntervalSec: number
  }): string {
    return buildSubagentPrompt(step, state, situation, identity)
  }

  renderStateForPlanning(state: GameState, situation: Situation): string {
    return this.briefing(state, situation)
  }

  logStateBar(name: string, state: GameState, situation: Situation): void {
    logStateBar(name, state, situation)
  }
}
