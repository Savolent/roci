import { Layer } from "effect"
import type { SituationClassifier } from "../../core/limbic/thalamus/situation-classifier.js"
import { SituationClassifierTag } from "../../core/limbic/thalamus/situation-classifier.js"
import type { GameState } from "./types.js"
import { classifySituation } from "./situation-classifier.js"
import { generateBriefing } from "./briefing.js"

const spaceMoltSituationClassifier: SituationClassifier = {
  classify(state) {
    const situation = classifySituation(state as GameState)
    situation.alerts = [] // Alerts owned by InterruptRegistry
    return situation
  },

  briefing(state, situation) {
    return generateBriefing(state as GameState, situation as ReturnType<typeof classifySituation>)
  },
}

/** Layer providing the SpaceMolt situation classifier. */
export const SpaceMoltSituationClassifierLive = Layer.succeed(SituationClassifierTag, spaceMoltSituationClassifier)
