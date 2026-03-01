import { Effect, Layer } from "effect"
import type { ContextHandler, ProcessedContext } from "../../core/context-handler.js"
import { ContextHandlerTag } from "../../core/context-handler.js"
import type { CharacterConfig } from "../../services/CharacterFs.js"
import { CharacterLog } from "../../logging/log-writer.js"
import { logToConsole } from "../../logging/console-renderer.js"

const spaceMoltContextHandler: ContextHandler = {
  processContext(
    context: Record<string, unknown>,
    char: CharacterConfig,
  ): Effect.Effect<ProcessedContext, never, CharacterLog> {
    return Effect.gen(function* () {
      const log = yield* CharacterLog
      const chatMessages: ProcessedContext["chatMessages"] = []

      if (context.chatMessage) {
        const msg = context.chatMessage as { channel: string; sender: string; content: string }
        chatMessages.push(msg)
        yield* logToConsole(char.name, "ws:chat",
          `[${msg.channel}] ${msg.sender}: ${msg.content}`)
        yield* log.word(char, {
          timestamp: new Date().toISOString(),
          source: "ws",
          character: char.name,
          type: "chat_received",
          ...msg,
        }).pipe(Effect.catchAll(() => Effect.void))
      }

      if (context.combatUpdate) {
        const p = context.combatUpdate as { attacker: string; target: string; damage: number; destroyed?: boolean }
        yield* logToConsole(char.name, "ws:combat",
          `${p.attacker} -> ${p.target}: ${p.damage} dmg${p.destroyed ? " [DESTROYED]" : ""}`)
        yield* log.action(char, {
          timestamp: new Date().toISOString(),
          source: "ws",
          character: char.name,
          type: "combat_update",
          ...p,
        }).pipe(Effect.catchAll(() => Effect.void))
      }

      if (context.deathEvent) {
        const d = context.deathEvent as { killer_name: string; cause: string; respawn_base: string }
        yield* logToConsole(char.name, "ws:death",
          `Killed by ${d.killer_name}: ${d.cause}. Respawning at ${d.respawn_base}`)
      }

      if (context.error) {
        const e = context.error as { code: string; message: string }
        yield* logToConsole(char.name, "ws:error", `[${e.code}] ${e.message}`)
      }

      return { chatMessages }
    })
  },
}

/** Layer providing the SpaceMolt context handler. */
export const SpaceMoltContextHandlerLive = Layer.succeed(ContextHandlerTag, spaceMoltContextHandler)
