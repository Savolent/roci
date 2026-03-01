import { Layer } from "effect"
import type { Tool, ToolRegistry } from "../../core/tool.js"
import { ToolRegistryTag } from "../../core/tool.js"

const smTools: ReadonlyArray<Tool> = [
  { name: "sm status", description: "Check your current state", usage: "sm status", category: "info" },
  { name: "sm mine", description: "Mine resources at current POI", usage: "sm mine", category: "resource" },
  { name: "sm sell", description: "Sell cargo items", usage: "sm sell [item_id] [qty]", category: "trading" },
  { name: "sm buy", description: "Buy items", usage: "sm buy [item_id] [qty]", category: "trading" },
  { name: "sm jump", description: "Jump to another system", usage: "sm jump [system_id]", category: "navigation" },
  { name: "sm travel", description: "Travel to a POI in current system", usage: "sm travel [poi_id]", category: "navigation" },
  { name: "sm dock", description: "Dock at station", usage: "sm dock", category: "navigation" },
  { name: "sm undock", description: "Undock from station", usage: "sm undock", category: "navigation" },
  { name: "sm refuel", description: "Refuel at station", usage: "sm refuel", category: "maintenance" },
  { name: "sm repair", description: "Repair at station", usage: "sm repair", category: "maintenance" },
  { name: "sm attack", description: "Attack a target in combat", usage: "sm attack [target]", category: "combat" },
  { name: "sm flee", description: "Flee from combat", usage: "sm flee", category: "combat" },
  { name: "sm chat history", description: "View chat messages", usage: "sm chat history", category: "social" },
  { name: "sm chat send", description: "Send a chat message", usage: "sm chat send [channel] [msg]", category: "social" },
  { name: "sm market", description: "View market prices", usage: "sm market", category: "trading" },
  { name: "sm cargo", description: "Check cargo contents", usage: "sm cargo", category: "info" },
  { name: "sm nearby", description: "See nearby players", usage: "sm nearby", category: "info" },
]

const spaceMoltToolRegistry: ToolRegistry = {
  tools: smTools,

  documentation(): string {
    return `The \`sm\` CLI is already installed on your PATH — just run it directly. Do NOT try to install, build, or locate it. Run \`sm --help\` for the full list of commands. Key commands:
${smTools.map((t) => `- \`${t.usage}\` — ${t.description}`).join("\n")}`
  },
}

/** Layer providing the SpaceMolt tool registry. */
export const SpaceMoltToolRegistryLive = Layer.succeed(ToolRegistryTag, spaceMoltToolRegistry)
