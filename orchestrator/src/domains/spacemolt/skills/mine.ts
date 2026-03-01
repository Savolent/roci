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
    const stateSnapshot = snapshot(state)

    // Always complete if cargo is full — can't mine more regardless of condition
    if (state.ship.cargo_used >= state.ship.cargo_capacity) {
      return {
        complete: true,
        reason: `Cargo full (${state.ship.cargo_used}/${state.ship.cargo_capacity})`,
        matchedCondition: "cargo full (implicit)",
        relevantState: stateSnapshot,
      }
    }

    const cond = step.successCondition.toLowerCase()

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

    // Match numeric cargo thresholds: "45/50", "cargo >= 45", "at or above 45", "at least 45"
    if (cond.includes("cargo")) {
      // Try "N/M" format first (e.g. "45/50")
      const slashMatch = cond.match(/(\d+)\s*\/\s*(\d+)/)
      if (slashMatch) {
        const target = parseInt(slashMatch[1], 10)
        const met = state.ship.cargo_used >= target
        return {
          complete: met,
          reason: met
            ? `Cargo ${state.ship.cargo_used}/${state.ship.cargo_capacity} (>= ${target})`
            : `Cargo ${state.ship.cargo_used}/${state.ship.cargo_capacity}, need >= ${target}`,
          matchedCondition: `cargo >= ${target}`,
          relevantState: stateSnapshot,
        }
      }
      // Try "at least N", "at or above N", ">= N", "> N"
      const thresholdMatch = cond.match(/(?:at\s+(?:or\s+above|least)|>=?)\s*(\d+)/)
      if (thresholdMatch) {
        const target = parseInt(thresholdMatch[1], 10)
        const met = state.ship.cargo_used >= target
        return {
          complete: met,
          reason: met
            ? `Cargo ${state.ship.cargo_used}/${state.ship.cargo_capacity} (>= ${target})`
            : `Cargo ${state.ship.cargo_used}/${state.ship.cargo_capacity}, need >= ${target}`,
          matchedCondition: `cargo >= ${target}`,
          relevantState: stateSnapshot,
        }
      }
    }

    return { complete: false, reason: `Condition "${step.successCondition}" not matched by mine skill`, matchedCondition: null, relevantState: stateSnapshot }
  },
}
