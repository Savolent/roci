import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const exploreSkill: Skill<GameState, Situation> = {
  name: "explore",
  description: "Explore the current area and gather information",
  instructions: "Explore the current area. Check `sm status` for your situation, `sm system` for POIs, `sm map` for connected systems. Make observations and decide what to do next.",
  defaultModel: "haiku",
  defaultTimeoutTicks: 10,
  checkCompletion(step, state, _situation) {
    const stateSnapshot = snapshot(state)
    // Explore tasks have no deterministic completion — always fall through to LLM evaluation
    return { complete: false, reason: "Explore completion requires LLM evaluation", matchedCondition: null, relevantState: stateSnapshot }
  },
}
