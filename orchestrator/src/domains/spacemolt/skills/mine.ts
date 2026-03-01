import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const mineSkill: Skill<GameState, Situation> = {
  name: "mine",
  description: "Mine resources at the current location until cargo is nearly full",
  instructions: "Mine at your current location. Use `sm mine` repeatedly. Check `sm status` to monitor cargo. Stop when cargo is more than 90% full or when there are no more resources to mine.",
  defaultModel: "haiku",
  defaultTimeoutTicks: 15,
  checkCompletion(step, state, _situation) {
    const cond = step.successCondition.toLowerCase()
    const stateSnapshot = snapshot(state)

    if (cond.includes("cargo") && cond.includes("90%")) {
      const met = state.ship.cargo_used / state.ship.cargo_capacity > 0.9
      return {
        complete: met,
        reason: met
          ? `Cargo at ${Math.round((state.ship.cargo_used / state.ship.cargo_capacity) * 100)}% (>90%)`
          : `Cargo at ${Math.round((state.ship.cargo_used / state.ship.cargo_capacity) * 100)}%, need >90%`,
        matchedCondition: "cargo > 90%",
        relevantState: stateSnapshot,
      }
    }
    if (cond.includes("cargo") && cond.includes("full")) {
      const met = state.ship.cargo_used >= state.ship.cargo_capacity
      return {
        complete: met,
        reason: met
          ? `Cargo full (${state.ship.cargo_used}/${state.ship.cargo_capacity})`
          : `Cargo not full (${state.ship.cargo_used}/${state.ship.cargo_capacity})`,
        matchedCondition: "cargo full",
        relevantState: stateSnapshot,
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by mine skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
