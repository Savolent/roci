import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const dockSkill: Skill<GameState, Situation> = {
  name: "dock",
  description: "Dock at the nearest station",
  instructions: "Dock at the nearest station. Use `sm dock` if at a dockable POI. If not at a dockable POI, travel to one first.",
  defaultModel: "haiku",
  defaultTimeoutTicks: 10,
  checkCompletion(step, state, _situation) {
    const cond = step.successCondition.toLowerCase()
    const stateSnapshot = snapshot(state)

    if (cond.includes("docked") && !cond.includes("not")) {
      const met = state.player.docked_at_base !== null
      return {
        complete: met,
        reason: met ? `Docked at ${state.player.docked_at_base}` : "Not docked",
        matchedCondition: "docked",
        relevantState: stateSnapshot,
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by dock skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
