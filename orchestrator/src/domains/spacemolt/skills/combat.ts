import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const combatSkill: Skill<GameState, Situation> = {
  name: "combat",
  description: "Fight or flee from combat",
  instructions: "You are in combat. Assess the threat. Use `sm attack [target]` to fight or `sm flee` to escape. Check `sm status` to monitor hull and shields. Prioritize survival.",
  defaultModel: "sonnet",
  defaultTimeoutTicks: 10,
  checkCompletion(step, state, _situation) {
    const cond = step.successCondition.toLowerCase()
    const stateSnapshot = snapshot(state)

    if (cond.includes("not") && cond.includes("combat")) {
      const met = !state.inCombat
      return {
        complete: met,
        reason: met ? "Not in combat" : "Still in combat",
        matchedCondition: "not in combat",
        relevantState: stateSnapshot,
      }
    }
    if (cond.includes("combat") && cond.includes("over")) {
      const met = !state.inCombat
      return {
        complete: met,
        reason: met ? "Combat over" : "Still in combat",
        matchedCondition: "combat over",
        relevantState: stateSnapshot,
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by combat skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
