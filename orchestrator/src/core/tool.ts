import { Context } from "effect"

/**
 * An atomic action available to the subagent.
 */
export interface Tool {
  readonly name: string
  readonly description: string
  readonly usage: string
  /** Category for grouping in docs (e.g., "navigation", "trading", "combat") */
  readonly category?: string
}

/**
 * Registry of tools (CLI commands) available to the subagent.
 */
export interface ToolRegistry {
  readonly tools: ReadonlyArray<Tool>
  /** Formatted tool documentation for subagent prompt */
  documentation(): string
}

/**
 * Effect service tag for the tool registry.
 */
export class ToolRegistryTag extends Context.Tag("ToolRegistry")<
  ToolRegistryTag,
  ToolRegistry
>() {}
