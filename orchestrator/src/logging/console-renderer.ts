import { Effect } from "effect"
import type { GameState, Situation } from "../../../harness/src/types.js"
import type { Plan } from "../ai/types.js"
import type { StepCompletionResult } from "../monitor/plan-tracker.js"

function ts(): string {
  const now = new Date()
  return now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

// ── System messages (monitor, brain, errors) ──────────────

/** System/orchestrator message with bracket prefix. */
export const logToConsole = (
  character: string,
  source: string,
  message: string,
) =>
  Effect.sync(() => {
    const prefix = `${ts()} [${character}:${source}]`
    for (const line of message.split("\n")) {
      console.log(`${prefix} ${line}`)
    }
  })

// ── Storytelling output (character voice) ─────────────────

/** State bar as a character section header. */
export const logStateBar = (
  character: string,
  state: GameState,
  _situation: Situation,
) =>
  Effect.sync(() => {
    const loc = state.poi?.name ?? state.player.current_poi
    const sys = state.system?.name ?? state.player.current_system
    const fuel = `fuel ${Math.round((state.ship.fuel / state.ship.max_fuel) * 100)}%`
    const hull = `hull ${Math.round((state.ship.hull / state.ship.max_hull) * 100)}%`
    const cargo = `cargo ${state.ship.cargo_used}/${state.ship.cargo_capacity}`
    const cr = `${state.player.credits.toLocaleString()} cr`
    const status = state.player.docked_at_base ? "DOCKED" : state.inCombat ? "COMBAT" : state.travelProgress ? "TRANSIT" : "SPACE"

    console.log("")
    console.log(`${ts()} == ${character} @ ${loc} (${sys}) == ${fuel} | ${hull} | ${cargo} | ${cr} | ${status}`)
  })

/** Step transition header when spawning a subagent. */
export const logPlanTransition = (
  character: string,
  plan: Plan,
  stepIndex: number,
) =>
  Effect.sync(() => {
    const step = plan.steps[stepIndex]
    console.log(`${ts()} -- Step ${stepIndex + 1}/${plan.steps.length}: ${step.task} -- ${step.goal}`)
  })

/** Step completion result. */
export const logStepResult = (
  _character: string,
  stepIndex: number,
  result: StepCompletionResult,
) =>
  Effect.sync(() => {
    const marker = result.complete ? "OK" : "FAILED"
    console.log(`${ts()} [${marker}] Step ${stepIndex + 1}: ${result.reason}`)
  })

// ── Character narrative lines (used by log-demux) ────────

/** Character thought — the LLM's voice IS the character. */
export const logCharThought = (character: string, text: string) =>
  Effect.sync(() => {
    // Take first meaningful line, max 140 chars
    const firstLine = text.split("\n").find((l) => l.trim().length > 0)?.trim() ?? ""
    if (firstLine) {
      console.log(`${ts()} ${character}: "${firstLine.slice(0, 140)}"`)
    }
  })

/** Character action — an sm command the character runs. */
export const logCharAction = (_character: string, command: string) =>
  Effect.sync(() => {
    console.log(`${ts()}   $ ${command}`)
  })

/** Tool result — what the game returned. */
export const logCharResult = (text: string) =>
  Effect.sync(() => {
    const firstLine = text.split("\n").find((l) => l.trim().length > 0)?.trim() ?? ""
    if (firstLine) {
      console.log(`${ts()}   > ${firstLine.slice(0, 120)}`)
    }
  })

/** Format an unknown error into a readable string. */
export function formatError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === "object" && e !== null && "message" in e) return String((e as Record<string, unknown>).message)
  return String(e)
}
