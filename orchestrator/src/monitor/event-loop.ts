import { Effect, Queue, Layer } from "effect"
import type { CharacterConfig } from "../services/CharacterFs.js"
import type { GameState } from "../../../harness/src/types.js"
import type { GameEvent } from "../../../harness/src/ws-types.js"
import { SpaceMoltAdapterLive } from "../domains/spacemolt/adapter.js"
import { SpaceMoltEventProcessorLive } from "../domains/spacemolt/event-processor.js"
import { runStateMachine } from "../core/state-machine.js"

export interface EventLoopConfig {
  char: CharacterConfig
  containerId: string
  playerName: string
  projectRoot: string
  containerEnv?: Record<string, string>
  events: Queue.Queue<GameEvent>
  initialState: GameState
  tickIntervalSec: number
  /** Current game tick at connection time, for initializing tick tracking. */
  initialTick: number
}

/**
 * SpaceMolt event loop — provides the domain adapter and event processor
 * layers, then delegates to the generic state machine.
 */
export const eventLoop = (config: EventLoopConfig) =>
  runStateMachine({
    char: config.char,
    containerId: config.containerId,
    playerName: config.playerName,
    projectRoot: config.projectRoot,
    containerEnv: config.containerEnv,
    events: config.events,
    initialState: config.initialState,
    tickIntervalSec: config.tickIntervalSec,
    initialTick: config.initialTick,
  }).pipe(
    Effect.provide(Layer.merge(SpaceMoltAdapterLive, SpaceMoltEventProcessorLive)),
  )
