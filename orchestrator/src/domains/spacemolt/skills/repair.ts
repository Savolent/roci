import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const repairSkill: Skill<GameState, Situation> = {
  name: "repair",
  description: "Repair hull at the current station",
  instructions: "Repair your ship. Use `sm repair` while docked. Ensure you have enough credits.",
  defaultModel: "haiku",
  defaultTimeoutTicks: 5,
  checkCompletion(step, state, _situation) {
    const cond = step.successCondition.toLowerCase()
    const stateSnapshot = snapshot(state)

    if (cond.includes("hull") && cond.includes("full")) {
      const met = state.ship.hull >= state.ship.max_hull * 0.95
      return {
        complete: met,
        reason: met
          ? `Hull full (${state.ship.hull}/${state.ship.max_hull})`
          : `Hull at ${state.ship.hull}/${state.ship.max_hull}`,
        matchedCondition: "hull full",
        relevantState: stateSnapshot,
      }
    }
    if (cond.includes("repair")) {
      const met = state.ship.hull >= state.ship.max_hull * 0.95
      return {
        complete: met,
        reason: met
          ? `Repaired (${state.ship.hull}/${state.ship.max_hull})`
          : `Hull at ${state.ship.hull}/${state.ship.max_hull}`,
        matchedCondition: "repair",
        relevantState: stateSnapshot,
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by repair skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
