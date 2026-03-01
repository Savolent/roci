import { Effect, Queue, Layer } from "effect"
import type { CharacterConfig } from "../services/CharacterFs.js"
import type { GameState } from "../../../harness/src/types.js"
import type { GameEvent } from "../../../harness/src/ws-types.js"
import { SpaceMoltEventProcessorLive } from "../domains/spacemolt/event-processor.js"
import { SpaceMoltSkillRegistryLive } from "../domains/spacemolt/skills/index.js"
import { SpaceMoltInterruptRegistryLive } from "../domains/spacemolt/interrupts.js"
import { SpaceMoltSituationClassifierLive } from "../domains/spacemolt/situation.js"
import { SpaceMoltStateRendererLive } from "../domains/spacemolt/renderer.js"
import { SpaceMoltToolRegistryLive } from "../domains/spacemolt/tools.js"
import { SpaceMoltPromptBuilderLive } from "../domains/spacemolt/prompt-builder.js"
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
 * SpaceMolt event loop — provides all domain service layers,
 * then delegates to the generic state machine.
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
    Effect.provide(
      SpaceMoltPromptBuilderLive.pipe(
        Layer.provide(Layer.mergeAll(
          SpaceMoltSkillRegistryLive,
          SpaceMoltToolRegistryLive,
        )),
        Layer.merge(SpaceMoltEventProcessorLive),
        Layer.merge(SpaceMoltSkillRegistryLive),
        Layer.merge(SpaceMoltInterruptRegistryLive),
        Layer.merge(SpaceMoltSituationClassifierLive),
        Layer.merge(SpaceMoltStateRendererLive),
        Layer.merge(SpaceMoltToolRegistryLive),
      ),
    ),
  )
