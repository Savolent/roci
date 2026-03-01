import { Effect } from "effect"

/**
 * Per-agent-instance configuration and filesystem access.
 * Replaces the domain-specific CharacterConfig + CharacterFs pairing
 * with a generic identity that any domain can implement.
 */
export interface AgentIdentity {
  /** Unique name for this agent instance. */
  readonly name: string
  /** Absolute path to this agent's data directory. */
  readonly dir: string

  /** Read the agent's diary/memory file. */
  readMemory(): Effect.Effect<string, unknown>
  /** Write the agent's diary/memory file. */
  writeMemory(content: string): Effect.Effect<void, unknown>
  /** Read the agent's background/personality description. */
  readBackground(): Effect.Effect<string, unknown>
  /** Read the agent's values/directives. */
  readValues(): Effect.Effect<string, unknown>
  /** Read domain-specific connection credentials. */
  readCredentials(): Effect.Effect<unknown, unknown>
}
