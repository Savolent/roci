import type { Skill } from "../../../core/skill.js"
import type { GameState, Situation } from "../types.js"
import { snapshot } from "../state-renderer.js"

export const sellSkill: Skill<GameState, Situation> = {
  name: "sell",
  description: "Sell cargo at the current station",
  instructions: "Sell cargo at the current station. Use `sm sell [item_id] [quantity]` to sell items. Check market prices first with `sm market`. Sell strategically — prioritize items with good buy orders.",
  defaultModel: "haiku",
  defaultTimeoutTicks: 10,
  checkCompletion(step, state, _situation) {
    const cond = step.successCondition.toLowerCase()
    const stateSnapshot = snapshot(state)

    if (cond.includes("cargo") && cond.includes("empty")) {
      const met = state.ship.cargo_used === 0
      return {
        complete: met,
        reason: met
          ? "Cargo is empty"
          : `Cargo not empty (${state.ship.cargo_used}/${state.ship.cargo_capacity})`,
        matchedCondition: "cargo empty",
        relevantState: stateSnapshot,
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by sell skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
