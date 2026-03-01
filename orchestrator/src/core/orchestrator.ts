import { Effect, Fiber } from "effect"
import { logToConsole } from "../logging/console-renderer.js"

/**
 * Generic multi-agent orchestrator.
 * Forks each agent loop as a Fiber and waits for all to complete.
 *
 * @param agentEffects — Array of agent loop Effects to run concurrently.
 */
export const runAgentOrchestrator = (
  agentEffects: Effect.Effect<void, unknown, any>[],
) =>
  Effect.gen(function* () {
    yield* logToConsole("orchestrator", "main", `Starting ${agentEffects.length} agent(s)...`)

    const fibers = yield* Effect.forEach(agentEffects, (agentEffect) =>
      agentEffect.pipe(
        Effect.catchAll((e) =>
          logToConsole("orchestrator", "main", `Agent fatal error: ${e}`),
        ),
        Effect.fork,
      ),
    )

    yield* logToConsole(
      "orchestrator",
      "main",
      `All ${fibers.length} agent(s) running. Press Ctrl-C to stop.`,
    )

    yield* Fiber.joinAll(fibers)
  })
