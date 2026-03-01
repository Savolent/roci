import { Context } from "effect"

/**
 * Derives a structured situation from raw domain state.
 *
 * @typeParam S — Domain state (e.g. GameState)
 * @typeParam Sit — Structured situation derived from state (e.g. Situation)
 */
export interface SituationClassifier<S = any, Sit = any> {
  /** Derive structured situation (type, flags, alerts) from raw state. */
  classify(state: S): Sit
  /** Human-readable briefing for the brain. */
  briefing(state: S, situation: Sit): string
}

/**
 * Effect service tag for the situation classifier.
 */
export class SituationClassifierTag extends Context.Tag("SituationClassifier")<
  SituationClassifierTag,
  SituationClassifier
>() {}
