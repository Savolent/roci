import type { PlanStep, StepCompletionResult } from "../../core/types.js"
import type { GameState, Situation } from "./types.js"
import { snapshot } from "./state-renderer.js"

/**
 * Check if a plan step's success condition is met by evaluating
 * simple conditions against the current game state.
 *
 * Used for mid-run state checks (while subagent is still running)
 * and for deterministic short-circuit during post-completion evaluation.
 */
export function isStepComplete(
  step: PlanStep,
  state: GameState,
  _situation: Situation,
): StepCompletionResult {
  const cond = step.successCondition.toLowerCase()
  const stateSnapshot = snapshot(state)

  // Cargo-related conditions
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

  // Docking conditions
  if (cond.includes("docked") && !cond.includes("not")) {
    const met = state.player.docked_at_base !== null
    return {
      complete: met,
      reason: met ? `Docked at ${state.player.docked_at_base}` : "Not docked",
      matchedCondition: "docked",
      relevantState: stateSnapshot,
    }
  }
  if (cond.includes("undocked") || (cond.includes("not") && cond.includes("docked"))) {
    const met = state.player.docked_at_base === null
    return {
      complete: met,
      reason: met ? "Undocked" : `Still docked at ${state.player.docked_at_base}`,
      matchedCondition: "undocked",
      relevantState: stateSnapshot,
    }
  }

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

  // Fuel conditions
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

  // Hull conditions
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

  // Combat conditions
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

  // Default: condition not recognized, subagent still running
  return {
    complete: false,
    reason: `Condition "${step.successCondition}" not recognized, subagent still running.`,
    matchedCondition: null,
    relevantState: stateSnapshot,
  }
}
