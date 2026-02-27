import { Args, Command, Options } from "@effect/cli"
import { Effect, Layer } from "effect"
import { NodeContext } from "@effect/platform-node"
import { FileSystem } from "@effect/platform"
import * as path from "node:path"
import { Docker, DockerLive } from "./services/Docker.js"
import { CharacterFs, CharacterFsLive, makeCharacterConfig } from "./services/CharacterFs.js"
import { makePromptTemplatesLive } from "./services/PromptTemplates.js"
import { makeGameApiLive } from "./services/GameApi.js"
import { Claude, ClaudeLive } from "./services/Claude.js"
import { makeGameSocketLive } from "./services/GameSocket.js"
import { makeCharacterLogLive } from "./logging/log-writer.js"
import { runOrchestrator } from "./pipeline/orchestrator.js"
import { logToConsole } from "./logging/console-renderer.js"

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..")
const IMAGE_NAME = "spacemolt-player"

// Shared options
const tickInterval = Options.integer("tick-interval").pipe(
  Options.withDefault(30),
  Options.withDescription("Seconds between monitor ticks"),
)

// --- start command ---
const startCharacters = Args.text({ name: "characters" }).pipe(Args.repeated)

const startCommand = Command.make("start", { characters: startCharacters, tickInterval }, (args) =>
  Effect.gen(function* () {
    const characters = args.characters
    if (characters.length === 0) {
      yield* Effect.logError("No characters specified. Usage: roci start <character> [character...]")
      return
    }

    // Validate all characters exist
    const charFs = yield* CharacterFs
    const configs = []
    for (const name of characters) {
      const char = makeCharacterConfig(PROJECT_ROOT, name)
      const exists = yield* charFs.characterExists(char)
      if (!exists) {
        yield* Effect.logError(`Character directory not found: ${char.dir}`)
        return
      }
      configs.push({
        char,
        projectRoot: PROJECT_ROOT,
        tickIntervalSeconds: args.tickInterval,
        imageName: IMAGE_NAME,
      })
    }

    // Build docker image
    const docker = yield* Docker
    yield* logToConsole("orchestrator", "main", "Building Docker image...")
    yield* docker.build(
      IMAGE_NAME,
      path.resolve(PROJECT_ROOT, ".devcontainer/Dockerfile"),
      path.resolve(PROJECT_ROOT, ".devcontainer"),
    )

    // Run orchestrator
    yield* runOrchestrator(configs)
  }),
).pipe(Command.withDescription("Start character(s) running"))

const SHARED_CONTAINER = "roci-crew"

// --- stop command ---
const stopCommand = Command.make("stop", {}, () =>
  Effect.gen(function* () {
    const docker = yield* Docker
    yield* docker.stop(SHARED_CONTAINER)
    yield* logToConsole("orchestrator", "cli", "Shared container stopped")
  }),
).pipe(Command.withDescription("Stop the shared roci-crew container"))

// --- pause command ---
const pauseCommand = Command.make("pause", {}, () =>
  Effect.gen(function* () {
    const docker = yield* Docker
    yield* docker.pause(SHARED_CONTAINER)
    yield* logToConsole("orchestrator", "cli", "Shared container paused")
  }),
).pipe(Command.withDescription("Pause the shared roci-crew container"))

// --- resume command ---
const resumeCommand = Command.make("resume", {}, () =>
  Effect.gen(function* () {
    const docker = yield* Docker
    yield* docker.resume(SHARED_CONTAINER)
    yield* logToConsole("orchestrator", "cli", "Shared container resumed")
  }),
).pipe(Command.withDescription("Resume the shared roci-crew container"))

// --- status command ---
const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const docker = yield* Docker
    const info = yield* docker.status(SHARED_CONTAINER)

    if (!info) {
      yield* Effect.log("No roci-crew container found.")
      return
    }

    yield* Effect.log(`roci-crew: ${info.status} (${info.id.slice(0, 12)})`)
  }),
).pipe(Command.withDescription("Show status of the shared roci-crew container"))

// --- auth command ---
const authCommand = Command.make("auth", {}, () =>
  Effect.gen(function* () {
    yield* logToConsole("orchestrator", "cli", "Starting interactive auth...")
    yield* Effect.log(`Run: docker exec -it ${SHARED_CONTAINER} sh -c 'claude && touch /tmp/auth-ready'`)
  }),
).pipe(Command.withDescription("Authenticate Claude in the shared container"))

// --- destroy command ---
const destroyCommand = Command.make("destroy", {}, () =>
  Effect.gen(function* () {
    const docker = yield* Docker
    yield* docker.remove(SHARED_CONTAINER)
    yield* logToConsole("orchestrator", "cli", "Shared container destroyed")
  }),
).pipe(Command.withDescription("Remove the shared roci-crew container"))

// --- logs command ---
const logsCharacter = Args.text({ name: "character" })

const logsCommand = Command.make("logs", { character: logsCharacter }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const thoughtsPath = path.resolve(
      PROJECT_ROOT,
      "players",
      args.character,
      "logs",
      "thoughts.jsonl",
    )
    const content = yield* fs.readFileString(thoughtsPath).pipe(
      Effect.catchAll(() => Effect.succeed("(no thoughts log found)")),
    )
    // Show last 50 entries
    const lines = content.split("\n").filter(Boolean).slice(-50)
    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        const ts = (entry.timestamp as string)?.slice(11, 19) ?? ""
        const source = entry.source ?? "?"
        const text = entry.text ?? entry.type ?? JSON.stringify(entry)
        console.log(`[${ts}] [${source}] ${typeof text === "string" ? text.slice(0, 200) : JSON.stringify(text)}`)
      } catch {
        console.log(line)
      }
    }
  }),
).pipe(Command.withDescription("Show recent thoughts for a character"))

// --- root command ---
const rociCommand = Command.make("roci").pipe(
  Command.withSubcommands([
    startCommand,
    stopCommand,
    pauseCommand,
    resumeCommand,
    statusCommand,
    authCommand,
    destroyCommand,
    logsCommand,
  ]),
  Command.withDescription("Rocinante crew orchestrator"),
)

// --- provide services ---
const serviceLayer = Layer.mergeAll(
  DockerLive,
  ClaudeLive,
  CharacterFsLive,
  makePromptTemplatesLive(PROJECT_ROOT),
  makeGameApiLive(),
  makeGameSocketLive(),
  makeCharacterLogLive(PROJECT_ROOT),
)

export { rociCommand, serviceLayer }
