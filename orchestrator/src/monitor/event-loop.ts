import { Effect, Queue } from "effect"
import type { CharacterConfig } from "../services/CharacterFs.js"
import type { GameState } from "../../../harness/src/types.js"
import type { GameEvent } from "../../../harness/src/ws-types.js"
import { SpaceMoltAdapter } from "../domains/spacemolt/adapter.js"
import { SpaceMoltEventProcessor } from "../domains/spacemolt/event-processor.js"
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
 * SpaceMolt event loop — thin wrapper that constructs the domain adapter
 * and event processor, then delegates to the generic state machine.
 */
export const eventLoop = (config: EventLoopConfig) =>
  Effect.gen(function* () {
    const adapter = new SpaceMoltAdapter()
    const eventProcessor = new SpaceMoltEventProcessor()

    yield* runStateMachine({
      adapter,
      eventProcessor,
      char: config.char,
      containerId: config.containerId,
      playerName: config.playerName,
      projectRoot: config.projectRoot,
      containerEnv: config.containerEnv,
      events: config.events,
      initialState: config.initialState,
      tickIntervalSec: config.tickIntervalSec,
      initialTick: config.initialTick,
    })
  })
