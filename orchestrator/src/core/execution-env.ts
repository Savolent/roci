import { Effect, Stream, Scope } from "effect"
import type { ClaudeModel } from "../services/Claude.js"

/**
 * How actor agents (subagents) run. Abstracts away the execution substrate
 * (Docker container, local shell, remote VM, etc.).
 *
 * Methods use `any` for the R (requirements) type parameter so that
 * implementations can depend on whatever Effect services they need
 * (e.g. Docker, Claude). The consumer provides those services at the call site.
 */
export interface ExecutionEnvironment {
  /** Initialize the execution environment (start container, set up shell, etc.). */
  initialize(config: {
    projectRoot: string
    imageName: string
  }): Effect.Effect<string, unknown, any>

  /** Execute a subagent, returning a streaming result and an exit handler. */
  executeSubagent(opts: {
    containerId: string
    playerName: string
    prompt: string
    model: ClaudeModel
    systemPrompt?: string
    env?: Record<string, string>
  }): Effect.Effect<
    {
      stream: Stream.Stream<string, unknown>
      waitForExit: Effect.Effect<{ exitCode: number; stderr: string }, unknown>
    },
    unknown,
    Scope.Scope | any
  >
}
