import { Effect, Deferred, Queue } from "effect"
import { FileSystem } from "@effect/platform"
import type { GitHubState, GitHubEvent, GitHubCharacterConfig } from "./types.js"
import type { Phase, PhaseContext, PhaseResult, PhaseRegistry, ConnectionState } from "../../core/phase.js"
import type { ExitReason } from "../../core/types.js"
import type { LifecycleHooks } from "../../core/lifecycle.js"
import { Docker } from "../../services/Docker.js"
import { GitHubClientTag, type GitHubClientConfig } from "./github-client.js"
import { eventLoop } from "../../monitor/event-loop.js"
import { logToConsole } from "../../logging/console-renderer.js"
import { CharacterLog } from "../../logging/log-writer.js"

/** Ticks in the active loop before exiting. At 30s/tick, 100 ticks ~ 50 min. */
const ACTIVE_SESSION_TURNS = 100

/** Default poll interval for GitHub API (30 seconds). */
const DEFAULT_POLL_INTERVAL_MS = 30_000

type GHConnection = ConnectionState<GitHubState, GitHubEvent>

/** Clone path inside the container for a specific repo. */
function repoClonePath(characterName: string, owner: string, repo: string): string {
  return `/work/players/${characterName}/repos/${owner}--${repo}`
}

/** Read github.json from the character's me/ directory. */
const readGitHubConfig = (charDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const configPath = `${charDir}/github.json`
    const content = yield* fs.readFileString(configPath).pipe(
      Effect.mapError((e) => new Error(`Failed to read github.json at ${configPath}: ${e}`)),
    )
    const parsed = JSON.parse(content) as GitHubCharacterConfig
    if (!parsed.token) {
      return yield* Effect.fail(new Error("github.json missing 'token' field"))
    }
    if (!parsed.repos || parsed.repos.length === 0) {
      return yield* Effect.fail(new Error("github.json missing or empty 'repos' array"))
    }
    return parsed
  })

/**
 * Clone a repo into the character's directory (idempotent).
 * If already cloned, fetches latest from origin instead.
 */
const ensureClone = (
  containerId: string,
  characterName: string,
  owner: string,
  repo: string,
  token: string,
) =>
  Effect.gen(function* () {
    const docker = yield* Docker
    const repoDir = repoClonePath(characterName, owner, repo)

    // Check if already cloned
    const exists = yield* docker.exec(containerId, [
      "sh", "-c", `test -d "${repoDir}/.git" && echo "yes" || echo "no"`,
    ])

    if (exists.trim() === "yes") {
      yield* docker.exec(containerId, [
        "git", "-C", repoDir, "fetch", "--all",
      ]).pipe(Effect.catchAll((e) => Effect.logWarning(`git fetch failed for ${owner}/${repo}: ${e}`)))
      yield* Effect.logInfo(`Repo already cloned at ${repoDir}, fetched latest`)
      return repoDir
    }

    // Ensure parent directory exists
    yield* docker.exec(containerId, ["mkdir", "-p", `/work/players/${characterName}/repos`])

    // Clone
    const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
    yield* docker.exec(containerId, ["git", "clone", cloneUrl, repoDir])

    // Configure git identity
    yield* docker.exec(containerId, [
      "git", "-C", repoDir, "config", "user.name", characterName,
    ])
    yield* docker.exec(containerId, [
      "git", "-C", repoDir, "config", "user.email", `${characterName}@roci-crew.local`,
    ])

    yield* Effect.logInfo(`Cloned ${owner}/${repo} to ${repoDir}`)
    return repoDir
  })

/** Get the current branch name in a clone. */
const getCurrentBranch = (containerId: string, repoDir: string) =>
  Effect.gen(function* () {
    const docker = yield* Docker
    return yield* docker.exec(containerId, [
      "git", "-C", repoDir, "rev-parse", "--abbrev-ref", "HEAD",
    ]).pipe(
      Effect.map((s) => s.trim()),
      Effect.catchAll(() => Effect.succeed("unknown")),
    )
  })

/**
 * Startup phase: read github.json, connect to GitHub, clone all repos.
 */
const startupPhase = {
  name: "startup",
  run: (context: PhaseContext) =>
    Effect.gen(function* () {
      const ghClient = yield* GitHubClientTag

      // Read github.json
      const ghConfig = yield* readGitHubConfig(context.char.dir)
      const parsedRepos = ghConfig.repos.map((r) => {
        const [owner, repo] = r.split("/")
        return { owner, repo }
      })

      yield* logToConsole(
        context.char.name,
        "orchestrator",
        `GitHub config: ${parsedRepos.length} repo(s) — ${ghConfig.repos.join(", ")}`,
      )

      const clientConfig: GitHubClientConfig = {
        repos: parsedRepos,
        pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
        token: ghConfig.token,
      }

      const { events, initialState, tickIntervalSec, initialTick } =
        yield* ghClient.connect(clientConfig)

      yield* logToConsole(context.char.name, "orchestrator", `Connected to GitHub API`)

      // Clone all repos into the character's directory
      for (let i = 0; i < parsedRepos.length; i++) {
        const { owner, repo } = parsedRepos[i]
        yield* logToConsole(context.char.name, "orchestrator", `Cloning ${owner}/${repo}...`)

        const repoDir = yield* ensureClone(
          context.containerId, context.char.name, owner, repo, ghConfig.token,
        ).pipe(
          Effect.catchAll((e) => {
            return Effect.logWarning(`Failed to clone ${owner}/${repo}: ${e}`).pipe(
              Effect.map(() => repoClonePath(context.char.name, owner, repo)),
            )
          }),
        )

        const branch = yield* getCurrentBranch(context.containerId, repoDir)
        initialState.repos[i].clonePath = repoDir
        initialState.repos[i].currentBranch = branch
      }

      yield* logToConsole(
        context.char.name,
        "orchestrator",
        `All repos ready`,
      )

      const connection: GHConnection = { events, initialState, tickIntervalSec, initialTick }
      return { _tag: "Continue", next: "active", connection } as PhaseResult
    }),
}

/**
 * Active phase: run the event loop with the domain bundle.
 */
const activePhase = {
  name: "active",
  run: (context: PhaseContext) =>
    Effect.gen(function* () {
      const log = yield* CharacterLog

      if (!context.connection) {
        yield* logToConsole(context.char.name, "orchestrator", "No connection in active phase — shutting down")
        return { _tag: "Shutdown" } as PhaseResult
      }

      const conn = context.connection as GHConnection
      const { events, initialState, tickIntervalSec, initialTick } = conn

      yield* logToConsole(context.char.name, "orchestrator", "Starting event loop...")

      yield* log.action(context.char, {
        timestamp: new Date().toISOString(),
        source: "orchestrator",
        character: context.char.name,
        type: "loop_start",
        containerId: context.containerId,
      })

      const exitSignal = yield* Deferred.make<ExitReason, never>()

      const hooks: LifecycleHooks = {
        shouldExit: (turnCount: number) => Effect.succeed(turnCount >= ACTIVE_SESSION_TURNS),
      }

      if (!context.domainBundle) {
        yield* logToConsole(context.char.name, "orchestrator", "No domainBundle in active phase — shutting down")
        return { _tag: "Shutdown" } as PhaseResult
      }

      yield* eventLoop({
        char: context.char,
        containerId: context.containerId,
        playerName: context.char.name,
        containerEnv: context.containerEnv,
        events: events as Queue.Queue<unknown>,
        initialState,
        tickIntervalSec,
        initialTick,
        exitSignal,
        hooks,
        domainBundle: context.domainBundle,
      })

      return { _tag: "Shutdown" } as PhaseResult
    }),
}

const allPhases = [
  startupPhase as unknown as Phase,
  activePhase as unknown as Phase,
] as const

export const gitHubPhaseRegistry: PhaseRegistry = {
  phases: allPhases,
  getPhase: (name: string) => allPhases.find((p) => p.name === name),
  initialPhase: "startup",
}
