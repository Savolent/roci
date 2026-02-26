import { Effect, Ref, Stream } from "effect"
import type { CharacterConfig } from "../services/CharacterFs.js"
import { CharacterLog, type LogEntry } from "./log-writer.js"
import { logCharThought, logCharAction, logCharResult, logToConsole } from "./console-renderer.js"

/** Patterns matching sm CLI commands that are social (chat/forum). */
const SOCIAL_COMMAND_PATTERN = /^sm\s+(chat|forum)\b/

/** Parse a stream-json line into a structured event, or null if not parseable. */
function parseStreamJson(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Classify and route a single stream-json event to the appropriate log streams. */
export const demuxEvent = (
  char: CharacterConfig,
  event: Record<string, unknown>,
  source: LogEntry["source"] = "subagent",
  textAccumulator?: Ref.Ref<string[]>,
) =>
  Effect.gen(function* () {
    const log = yield* CharacterLog
    const ts = new Date().toISOString()
    const type = event.type as string | undefined

    if (type === "assistant") {
      const message = event.message as Record<string, unknown> | undefined
      const content = message?.content as Array<Record<string, unknown>> | undefined
      if (!content) return

      for (const block of content) {
        if (block.type === "text") {
          yield* log.thought(char, {
            timestamp: ts,
            source,
            character: char.name,
            type: "text",
            text: block.text,
          })

          // Accumulate text for completion report
          if (textAccumulator) {
            yield* Ref.update(textAccumulator, (arr) => [...arr, block.text as string])
          }

          // Narrative: character's voice
          yield* logCharThought(char.name, block.text as string)
        } else if (block.type === "tool_use") {
          const toolName = block.name as string
          const input = block.input as Record<string, unknown> | undefined
          const command = (input?.command as string) ?? ""

          const entry: LogEntry = {
            timestamp: ts,
            source,
            character: char.name,
            type: "tool_use",
            tool: toolName,
            input,
          }

          // All tool calls go to actions
          yield* log.action(char, entry)

          // sm chat/forum commands also go to words
          if (toolName === "Bash" && SOCIAL_COMMAND_PATTERN.test(command)) {
            yield* log.word(char, entry)
          }

          // Narrative: character runs a command
          if (toolName === "Bash" && command.startsWith("sm ")) {
            yield* logCharAction(char.name, command)
          }
        }
      }
    } else if (type === "result") {
      // End-of-run result event — surface errors
      const isError = event.is_error as boolean | undefined
      const result = event.result as string | undefined
      if (isError && result) {
        yield* logToConsole(char.name, "error", `Subagent error: ${result}`)
      }
    } else if (type === "user") {
      // tool_result — log to actions
      yield* log.action(char, {
        timestamp: ts,
        source,
        character: char.name,
        type: "tool_result",
        content: event.message,
      })

      // Narrative: what the game returned
      const message = event.message as Record<string, unknown> | undefined
      const resultContent = message?.content as Array<Record<string, unknown>> | undefined
      if (resultContent) {
        for (const block of resultContent) {
          if (block.type === "tool_result") {
            const text = (block.content as string) ?? ""
            if (text.trim()) {
              yield* logCharResult(text)
            }
          }
        }
      }
    }
  })

/**
 * Process a stream of stream-json lines, routing each event to the
 * appropriate JSONL log files.
 */
export const demuxStream = (
  char: CharacterConfig,
  lines: Stream.Stream<string, unknown>,
  source: LogEntry["source"] = "subagent",
  textAccumulator?: Ref.Ref<string[]>,
) =>
  lines.pipe(
    Stream.filter((line) => line.trim().length > 0),
    Stream.map(parseStreamJson),
    Stream.filter((event): event is Record<string, unknown> => event !== null),
    Stream.mapEffect((event) => demuxEvent(char, event, source, textAccumulator)),
    Stream.runDrain,
  )
