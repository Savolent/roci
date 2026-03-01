import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const undockSkill: Skill<GameState, Situation> = {
  name: "undock",
  description: "Undock from the current station",
  instructions: "Undock from the current station. Use `sm undock` to leave the station.",
  defaultModel: "haiku",
  defaultTimeoutTicks: 5,
  checkCompletion(step, state, _situation) {
    const cond = step.successCondition.toLowerCase()
    const stateSnapshot = snapshot(state)

    if (cond.includes("undocked") || (cond.includes("not") && cond.includes("docked"))) {
      const met = state.player.docked_at_base === null
      return {
        complete: met,
        reason: met ? "Undocked" : `Still docked at ${state.player.docked_at_base}`,
        matchedCondition: "undocked",
        relevantState: stateSnapshot,
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by undock skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
