import { Layer } from "effect"
import type { Skill, SkillRegistry } from "../../../core/skill.js"
import { SkillRegistryTag } from "../../../core/skill.js"
import type { PlanStep, StepCompletionResult } from "../../../core/types.js"
import type { GameState, Situation } from "../types.js"

import { mineSkill } from "./mine.js"
import { travelSkill } from "./travel.js"
import { sellSkill } from "./sell.js"
import { dockSkill } from "./dock.js"
import { undockSkill } from "./undock.js"
import { refuelSkill } from "./refuel.js"
import { repairSkill } from "./repair.js"
import { combatSkill } from "./combat.js"
import { chatSkill } from "./chat.js"
import { exploreSkill } from "./explore.js"

const allSkills: ReadonlyArray<Skill<GameState, Situation>> = [
  mineSkill,
  travelSkill,
  sellSkill,
  dockSkill,
  undockSkill,
  refuelSkill,
  repairSkill,
  combatSkill,
  chatSkill,
  exploreSkill,
]

const skillMap = new Map(allSkills.map((s) => [s.name, s]))

const spaceMoltSkillRegistry: SkillRegistry<GameState, Situation> = {
  skills: allSkills,

  getSkill(name: string) {
    return skillMap.get(name)
  },

  taskList() {
    return allSkills.map((s) => s.name).join("|")
  },

  isStepComplete(step: PlanStep, state: GameState, situation: Situation): StepCompletionResult {
    const skill = skillMap.get(step.task)
    if (skill) {
      const result = skill.checkCompletion(step, state, situation)
      // If the skill's own matcher didn't recognize the condition, try shared matchers
      if (result.matchedCondition !== null || result.complete) {
        return result
      }
    }
    // Fall through to shared condition matchers (conditions that apply across skills)
    return checkSharedConditions(step, state)
  },
}

/**
 * Shared completion conditions that are not specific to a single skill.
 * For example, a "travel" step might have a "docked" success condition,
 * or any step might check cargo state.
 */
function checkSharedConditions(step: PlanStep, state: GameState): StepCompletionResult {
  const cond = step.successCondition.toLowerCase()
  const { ship, player } = state

  // Cargo conditions
  if (cond.includes("cargo") && cond.includes("90%")) {
    const met = ship.cargo_used / ship.cargo_capacity > 0.9
    return {
      complete: met,
      reason: met
        ? `Cargo at ${Math.round((ship.cargo_used / ship.cargo_capacity) * 100)}% (>90%)`
        : `Cargo at ${Math.round((ship.cargo_used / ship.cargo_capacity) * 100)}%, need >90%`,
      matchedCondition: "cargo > 90%",
      relevantState: {},
    }
  }
  if (cond.includes("cargo") && cond.includes("full")) {
    const met = ship.cargo_used >= ship.cargo_capacity
    return {
      complete: met,
      reason: met
        ? `Cargo full (${ship.cargo_used}/${ship.cargo_capacity})`
        : `Cargo not full (${ship.cargo_used}/${ship.cargo_capacity})`,
      matchedCondition: "cargo full",
      relevantState: {},
    }
  }
  if (cond.includes("cargo") && cond.includes("empty")) {
    const met = ship.cargo_used === 0
    return {
      complete: met,
      reason: met ? "Cargo is empty" : `Cargo not empty (${ship.cargo_used}/${ship.cargo_capacity})`,
      matchedCondition: "cargo empty",
      relevantState: {},
    }
  }

  // Docking conditions
  if (cond.includes("docked") && !cond.includes("not")) {
    const met = player.docked_at_base !== null
    return {
      complete: met,
      reason: met ? `Docked at ${player.docked_at_base}` : "Not docked",
      matchedCondition: "docked",
      relevantState: {},
    }
  }
  if (cond.includes("undocked") || (cond.includes("not") && cond.includes("docked"))) {
    const met = player.docked_at_base === null
    return {
      complete: met,
      reason: met ? "Undocked" : `Still docked at ${player.docked_at_base}`,
      matchedCondition: "undocked",
      relevantState: {},
    }
  }

  // Location conditions
  const systemMatch = cond.match(/current_system\s*==\s*["']?(\w+)["']?/)
  if (systemMatch) {
    const met = player.current_system === systemMatch[1]
    return {
      complete: met,
      reason: met
        ? `In system ${systemMatch[1]}`
        : `In system ${player.current_system}, need ${systemMatch[1]}`,
      matchedCondition: `current_system == ${systemMatch[1]}`,
      relevantState: {},
    }
  }
  const poiMatch = cond.match(/current_poi\s*==\s*["']?(\w+)["']?/)
  if (poiMatch) {
    const met = player.current_poi === poiMatch[1]
    return {
      complete: met,
      reason: met
        ? `At POI ${poiMatch[1]}`
        : `At POI ${player.current_poi}, need ${poiMatch[1]}`,
      matchedCondition: `current_poi == ${poiMatch[1]}`,
      relevantState: {},
    }
  }

  // Fuel conditions
  if (cond.includes("fuel") && cond.includes("full")) {
    const met = ship.fuel >= ship.max_fuel * 0.95
    return {
      complete: met,
      reason: met
        ? `Fuel full (${ship.fuel}/${ship.max_fuel})`
        : `Fuel at ${ship.fuel}/${ship.max_fuel}`,
      matchedCondition: "fuel full",
      relevantState: {},
    }
  }
  if (cond.includes("refuel")) {
    const met = ship.fuel >= ship.max_fuel * 0.95
    return {
      complete: met,
      reason: met
        ? `Refueled (${ship.fuel}/${ship.max_fuel})`
        : `Fuel at ${ship.fuel}/${ship.max_fuel}`,
      matchedCondition: "refuel",
      relevantState: {},
    }
  }

  // Hull conditions
  if (cond.includes("hull") && cond.includes("full")) {
    const met = ship.hull >= ship.max_hull * 0.95
    return {
      complete: met,
      reason: met
        ? `Hull full (${ship.hull}/${ship.max_hull})`
        : `Hull at ${ship.hull}/${ship.max_hull}`,
      matchedCondition: "hull full",
      relevantState: {},
    }
  }
  if (cond.includes("repair")) {
    const met = ship.hull >= ship.max_hull * 0.95
    return {
      complete: met,
      reason: met
        ? `Repaired (${ship.hull}/${ship.max_hull})`
        : `Hull at ${ship.hull}/${ship.max_hull}`,
      matchedCondition: "repair",
      relevantState: {},
    }
  }

  // Combat conditions
  if (cond.includes("not") && cond.includes("combat")) {
    const met = !state.inCombat
    return {
      complete: met,
      reason: met ? "Not in combat" : "Still in combat",
      matchedCondition: "not in combat",
      relevantState: {},
    }
  }
  if (cond.includes("combat") && cond.includes("over")) {
    const met = !state.inCombat
    return {
      complete: met,
      reason: met ? "Combat over" : "Still in combat",
      matchedCondition: "combat over",
      relevantState: {},
    }
  }

  // Transit conditions
  if (cond.includes("arrived") || cond.includes("arrival")) {
    const met = state.travelProgress === null
    return {
      complete: met,
      reason: met ? "Arrived at destination" : "Still in transit",
      matchedCondition: "arrived",
      relevantState: {},
    }
  }

  // Default: condition not recognized
  return {
    complete: false,
    reason: `Condition "${step.successCondition}" not recognized, subagent still running.`,
    matchedCondition: null,
    relevantState: {},
  }
}

/** Layer providing the SpaceMolt skill registry. */
export const SpaceMoltSkillRegistryLive = Layer.succeed(SkillRegistryTag, spaceMoltSkillRegistry)
