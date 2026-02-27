import { Effect } from "effect"
import { CharacterFs, type CharacterConfig } from "../services/CharacterFs.js"
import { CharacterLog } from "../logging/log-writer.js"
import { GameSocket } from "../services/GameSocket.js"
import { eventLoop } from "../monitor/event-loop.js"
import { dream } from "../ai/dream.js"
import { logToConsole } from "../logging/console-renderer.js"

export interface CharacterLoopConfig {
  char: CharacterConfig
  projectRoot: string
  tickIntervalSeconds: number
  imageName: string
  /** Shared container ID — set by orchestrator before forking character fibers */
  containerId?: string
  /** Env vars passed at docker exec time (e.g. CLAUDE_CODE_OAUTH_TOKEN) */
  containerEnv?: Record<string, string>
}

/**
 * Full lifecycle for a single character (shared container is already running):
 * 1. Connect to game via WebSocket
 * 2. Optionally dream (compress diary)
 * 3. Run the event loop (brain + subagents)
 */
export const characterLoop = (config: CharacterLoopConfig & { containerId: string }) =>
  Effect.scoped(
    Effect.gen(function* () {
      const charFs = yield* CharacterFs
      const log = yield* CharacterLog
      const gameSocket = yield* GameSocket

      const { containerId } = config

      yield* logToConsole(config.char.name, "orchestrator", "Starting character loop...")

      // 1. Connect to game via WebSocket
      const creds = yield* charFs.readCredentials(config.char)
      const { events, initialState, tickIntervalSec, initialTick } = yield* gameSocket.connect(creds, config.char.name)
      yield* logToConsole(config.char.name, "orchestrator",
        `Connected via WebSocket as ${initialState.player.username}`)

      // 2. Dream (compress diary if needed)
      const diary = yield* charFs.readDiary(config.char)
      const diaryLines = diary.split("\n").length
      if (diaryLines > 200) {
        yield* logToConsole(config.char.name, "orchestrator", `Diary is ${diaryLines} lines — dreaming...`)
        yield* dream.execute({ char: config.char }).pipe(
          Effect.catchAll((e) =>
            logToConsole(config.char.name, "orchestrator", `Dream failed: ${e}`),
          ),
        )
      }

      // 3. Run the event loop
      yield* logToConsole(config.char.name, "orchestrator", "Starting event loop...")

      yield* log.action(config.char, {
        timestamp: new Date().toISOString(),
        source: "orchestrator",
        character: config.char.name,
        type: "loop_start",
        containerId,
      })

      yield* eventLoop({
        char: config.char,
        containerId,
        playerName: config.char.name,
        projectRoot: config.projectRoot,
        containerEnv: config.containerEnv,
        events,
        initialState,
        tickIntervalSec,
        initialTick,
      })
    }),
  )
