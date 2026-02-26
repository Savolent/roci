import { Effect, Ref, Stream } from "effect"
import type { CharacterConfig } from "../services/CharacterFs.js"
import { CharacterLog, type LogEntry } from "./log-writer.js"
import { logCharThought, logCharAction, logCharResult, logStreamEvent } from "./console-renderer.js"

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

/** Format tool input for console display. */
function formatToolInput(toolName: string, input: Record<string, unknown> | undefined): string {
  if (!input) return toolName
  if (toolName === "Bash") {
    const cmd = (input.command as string) ?? ""
    return `${toolName}: ${cmd}`
  }
  return `${toolName}: ${JSON.stringify(input)}`
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
      if (!content) {
        yield* logStreamEvent(char.name, "assistant", "(no content)")
        return
      }

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

          // Type-tagged console output
          yield* logStreamEvent(char.name, "assistant:text", block.text as string)

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

          // Type-tagged console output
          yield* logStreamEvent(char.name, "assistant:tool_use", formatToolInput(toolName, input))

          // Narrative: character runs a command
          if (toolName === "Bash" && command.startsWith("sm ")) {
            yield* logCharAction(char.name, command)
          }
        } else {
          // Unknown content block type
          yield* logStreamEvent(char.name, `assistant:${block.type}`, JSON.stringify(block))
        }
      }
    } else if (type === "result") {
      const isError = event.is_error as boolean | undefined
      const result = event.result as string | undefined

      // Type-tagged console output
      yield* logStreamEvent(char.name, "result", `${isError ? "ERROR" : "ok"}: ${result ?? ""}`)

      if (isError && result) {
        yield* logStreamEvent(char.name, "error", `Subagent error: ${result}`)
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

      // Type-tagged console output — summarize tool result content
      const message = event.message as Record<string, unknown> | undefined
      const resultContent = message?.content as Array<Record<string, unknown>> | undefined
      if (resultContent) {
        for (const block of resultContent) {
          if (block.type === "tool_result") {
            const text = (block.content as string) ?? ""
            yield* logStreamEvent(char.name, "user:tool_result", text)
            if (text.trim()) {
              yield* logCharResult(text)
            }
          }
        }
      } else {
        yield* logStreamEvent(char.name, "user:tool_result", "(no content)")
      }
    } else if (type === "system") {
      yield* logStreamEvent(char.name, "system", JSON.stringify(event))
    } else {
      // Unknown event type — still show it
      yield* logStreamEvent(char.name, `unknown:${type ?? "undefined"}`, JSON.stringify(event))
    }
  })

/**
 * Process a stream of stream-json lines, routing each event to the
 * appropriate JSONL log files.  Every raw line is also appended to stream.jsonl.
 */
export const demuxStream = (
  char: CharacterConfig,
  lines: Stream.Stream<string, unknown>,
  source: LogEntry["source"] = "subagent",
  textAccumulator?: Ref.Ref<string[]>,
) =>
  lines.pipe(
    Stream.filter((line) => line.trim().length > 0),
    Stream.mapEffect((line) =>
      Effect.gen(function* () {
        const log = yield* CharacterLog

        // Raw capture — every line goes to stream.jsonl verbatim
        yield* log.raw(char, line)

        // Try to parse as JSON
        const event = parseStreamJson(line)
        if (event) {
          yield* demuxEvent(char, event, source, textAccumulator)
        } else {
          // Non-JSON line — log as [raw] so it's visible
          yield* logStreamEvent(char.name, "raw", line)
        }
      }),
    ),
    Stream.runDrain,
  )
