import { Effect, Layer } from "effect"
import type { ContextHandler } from "../../core/limbic/thalamus/context-handler.js"
import { ContextHandlerTag } from "../../core/limbic/thalamus/context-handler.js"

/** No-op context handler — GitHub domain has no chat concept. */
const gitHubContextHandler: ContextHandler = {
  processContext() {
    return Effect.succeed({})
  },
}

/** Layer providing the GitHub context handler. */
export const GitHubContextHandlerLive = Layer.succeed(ContextHandlerTag, gitHubContextHandler)
