import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const chatSkill: Skill<GameState, Situation> = {
  name: "chat",
  description: "Read and respond to chat messages",
  instructions: "Read recent chat and respond appropriately. Use `sm chat history` to read messages, `sm chat send [channel] [message]` to respond. Stay in character.",
  defaultModel: "sonnet",
  defaultTimeoutTicks: 8,
  checkCompletion(step, state, _situation) {
    const stateSnapshot = snapshot(state)
    // Chat tasks have no deterministic completion — always fall through to LLM evaluation
    return { complete: false, reason: "Chat completion requires LLM evaluation", matchedCondition: null, relevantState: stateSnapshot }
  },
}
