import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const travelSkill: Skill<GameState, Situation> = {
  name: "travel",
  description: "Navigate to a destination via jumps and intra-system travel",
  instructions: "Navigate to the destination. Use `sm jump [system_id]` for inter-system jumps, then `sm travel [poi_id]` for intra-system travel. Wait for arrival by checking `sm status` periodically.",
  defaultModel: "haiku",
  defaultTimeoutTicks: 15,
  checkCompletion(step, state, _situation) {
    const cond = step.successCondition.toLowerCase()
    const stateSnapshot = snapshot(state)

    // System/location conditions
    const systemMatch = cond.match(/current_system\s*==\s*["']?(\w+)["']?/)
    if (systemMatch) {
      const met = state.player.current_system === systemMatch[1]
      return {
        complete: met,
        reason: met
          ? `In system ${systemMatch[1]}`
          : `In system ${state.player.current_system}, need ${systemMatch[1]}`,
        matchedCondition: `current_system == ${systemMatch[1]}`,
        relevantState: stateSnapshot,
      }
    }
    const poiMatch = cond.match(/current_poi\s*==\s*["']?(\w+)["']?/)
    if (poiMatch) {
      const met = state.player.current_poi === poiMatch[1]
      return {
        complete: met,
        reason: met
          ? `At POI ${poiMatch[1]}`
          : `At POI ${state.player.current_poi}, need ${poiMatch[1]}`,
        matchedCondition: `current_poi == ${poiMatch[1]}`,
        relevantState: stateSnapshot,
      }
    }

    // Transit conditions
    if (cond.includes("arrived") || cond.includes("arrival")) {
      const met = state.travelProgress === null
      return {
        complete: met,
        reason: met ? "Arrived at destination" : "Still in transit",
        matchedCondition: "arrived",
        relevantState: stateSnapshot,
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by travel skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
