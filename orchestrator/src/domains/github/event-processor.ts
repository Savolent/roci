import { Layer } from "effect"
import { EventProcessorTag, type EventProcessor, type EventResult } from "../../core/event-source.js"
import type { GitHubEvent, GitHubState } from "./types.js"

const gitHubEventProcessor: EventProcessor = {
  processEvent(event, currentState) {
    const ghEvent = event as GitHubEvent
    switch (ghEvent.type) {
      case "poll_update": {
        const prev = currentState as GitHubState
        const { repoIndex, repoState } = ghEvent.payload
        const repos = [...prev.repos]
        // Preserve local clone info across poll updates (API doesn't know about it)
        repos[repoIndex] = {
          ...repoState,
          clonePath: repos[repoIndex]?.clonePath ?? null,
          currentBranch: repos[repoIndex]?.currentBranch ?? null,
        }
        return {
          stateUpdate: () => ({ ...prev, repos, timestamp: Date.now() }) as unknown,
          isStateUpdate: true,
        } satisfies EventResult
      }

      case "tick":
        return {
          tick: ghEvent.payload.tick,
          isTick: true,
        } satisfies EventResult

      default:
        return {}
    }
  },
}

/** Layer providing the GitHub event processor. */
export const GitHubEventProcessorLive = Layer.succeed(EventProcessorTag, gitHubEventProcessor)
