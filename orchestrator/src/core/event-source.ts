import { Context } from "effect"

/**
 * Translates raw domain events into state machine operations.
 *
 * @typeParam S — Domain state
 * @typeParam Evt — Raw event type from the domain's event source
 */
export interface EventProcessor<S, Evt> {
  /** Process a single event, returning how the state machine should react. */
  processEvent(event: Evt, currentState: S): EventResult<S>
}

export interface EventResult<S> {
  /** Merge into state. If undefined, state is unchanged. */
  stateUpdate?: (prev: S) => S
  /** Update tick counter. If undefined, tick is unchanged. */
  tick?: number
  /** Trigger interrupt processing (check for critical alerts). */
  isInterrupt?: boolean
  /** Kill everything and start fresh (e.g. death). */
  isReset?: boolean
  /** Flag indicating this is a full state update (triggers plan/spawn cycle). */
  isStateUpdate?: boolean
  /** Flag indicating this is a tick heartbeat (triggers mid-run checks + plan/spawn). */
  isTick?: boolean
  /** Accumulated context data (e.g. chat messages). Keyed by context type. */
  accumulatedContext?: Record<string, unknown>
  /** Logging side effect — called after state is updated. */
  log?: () => void
}

/**
 * Effect service tag for the event processor.
 *
 * Tags use `any` for type erasure — generic interfaces are invariant in their
 * type params, so concrete implementations (e.g. EventProcessor<GameState, GameEvent>)
 * can't assign to EventProcessor<unknown, unknown>. The state machine recovers
 * concrete types via explicit casts.
 */
export class EventProcessorTag extends Context.Tag("EventProcessor")<
  EventProcessorTag,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  EventProcessor<any, any>
>() {}
