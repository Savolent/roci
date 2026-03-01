import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const refuelSkill: Skill<GameState, Situation> = {
  name: "refuel",
  description: "Refuel at the current station",
  instructions: "Refuel your ship. Use `sm refuel` while docked. Ensure you have enough credits.",
  defaultModel: "haiku",
  defaultTimeoutTicks: 5,
  checkCompletion(step, state, _situation) {
    const cond = step.successCondition.toLowerCase()
    const stateSnapshot = snapshot(state)

    if (cond.includes("fuel") && cond.includes("full")) {
      const met = state.ship.fuel >= state.ship.max_fuel * 0.95
      return {
        complete: met,
        reason: met
          ? `Fuel full (${state.ship.fuel}/${state.ship.max_fuel})`
          : `Fuel at ${state.ship.fuel}/${state.ship.max_fuel}`,
        matchedCondition: "fuel full",
        relevantState: stateSnapshot,
      }
    }
    if (cond.includes("refuel")) {
      const met = state.ship.fuel >= state.ship.max_fuel * 0.95
      return {
        complete: met,
        reason: met
          ? `Refueled (${state.ship.fuel}/${state.ship.max_fuel})`
          : `Fuel at ${state.ship.fuel}/${state.ship.max_fuel}`,
        matchedCondition: "refuel",
        relevantState: stateSnapshot,
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by refuel skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
