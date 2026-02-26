import { Effect, Fiber } from "effect"
import { Docker, DockerError } from "../services/Docker.js"
import { characterLoop, type CharacterLoopConfig } from "./character-loop.js"
import { logToConsole } from "../logging/console-renderer.js"
import * as path from "node:path"
import { execSync } from "node:child_process"

const SHARED_CONTAINER_NAME = "roci-crew"

/**
 * Ensure the shared `roci-crew` container exists and is running.
 * Returns the container ID.
 */
const ensureSharedContainer = (config: { projectRoot: string; imageName: string }) =>
  Effect.gen(function* () {
    const docker = yield* Docker

    const existing = yield* docker.status(SHARED_CONTAINER_NAME)

    if (existing && existing.status === "running") {
      yield* logToConsole("orchestrator", "main", `Shared container ${SHARED_CONTAINER_NAME} already running`)
      return existing.id
    }

    if (existing && existing.status === "paused") {
      yield* docker.resume(SHARED_CONTAINER_NAME)
      yield* logToConsole("orchestrator", "main", `Shared container ${SHARED_CONTAINER_NAME} resumed`)
      return existing.id
    }

    // Remove old container if exists (exited/created)
    if (existing) {
      yield* docker.remove(SHARED_CONTAINER_NAME)
    }

    // Create the shared container with all mounts
    const containerId = yield* docker.create({
      name: SHARED_CONTAINER_NAME,
      image: config.imageName,
      mounts: [
        {
          host: path.resolve(config.projectRoot, "players"),
          container: "/work/players",
        },
        {
          host: path.resolve(config.projectRoot, "shared-resources/workspace"),
          container: "/work/shared/workspace",
        },
        {
          host: path.resolve(config.projectRoot, "shared-resources/spacemolt-docs"),
          container: "/work/shared/spacemolt-docs",
        },
        {
          host: path.resolve(config.projectRoot, "docs"),
          container: "/work/shared/docs",
        },
        {
          host: path.resolve(config.projectRoot, "shared-resources/sm-cli"),
          container: "/work/sm",
        },
        {
          host: path.resolve(config.projectRoot, ".claude"),
          container: "/work/.claude",
          readonly: true,
        },
        {
          host: path.resolve(config.projectRoot, ".devcontainer"),
          container: "/opt/devcontainer",
          readonly: true,
        },
        {
          host: path.resolve(config.projectRoot, "harness"),
          container: "/opt/harness",
          readonly: true,
        },
        {
          host: path.resolve(config.projectRoot, "scripts"),
          container: "/opt/scripts",
          readonly: true,
        },
        {
          host: path.resolve(config.projectRoot, ".claude-credentials.json"),
          container: "/home/node/.claude/.credentials.json",
          readonly: true,
        },
      ],
      env: {},
      cmd: ["bash", "-c", "sudo /usr/local/bin/init-firewall.sh && sleep infinity"],
      capAdd: ["NET_ADMIN", "NET_RAW"],
    })

    // Start the container
    yield* Effect.try({
      try: () => {
        execSync(`docker start ${containerId}`, { stdio: "pipe" })
      },
      catch: (e) => new DockerError("Failed to start shared container", e),
    })

    yield* logToConsole("orchestrator", "main", `Shared container ${SHARED_CONTAINER_NAME} created and started`)

    return containerId
  })

/**
 * Multi-character orchestrator. Ensures a single shared container,
 * spawns a Fiber per character, and waits for all to complete (or be interrupted).
 */
export const runOrchestrator = (configs: CharacterLoopConfig[]) =>
  Effect.gen(function* () {
    yield* logToConsole("orchestrator", "main", `Starting ${configs.length} character(s)...`)

    // Ensure the shared container is running (once for all characters)
    const containerId = yield* ensureSharedContainer({
      projectRoot: configs[0].projectRoot,
      imageName: configs[0].imageName,
    })

    // Fork each character loop as a fiber, passing the shared container ID
    const fibers = yield* Effect.forEach(configs, (config) =>
      characterLoop({ ...config, containerId }).pipe(
        Effect.catchAll((e) =>
          logToConsole(config.char.name, "orchestrator", `Fatal error: ${e}`),
        ),
        Effect.fork,
      ),
    )

    yield* logToConsole(
      "orchestrator",
      "main",
      `All ${fibers.length} character(s) running. Press Ctrl-C to stop.`,
    )

    // Wait for all fibers (they run indefinitely until interrupted)
    yield* Fiber.joinAll(fibers)
  })
