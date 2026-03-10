// ── THALAMUS ── Sensory relay: event processing, classification, context accumulation
export type { EventProcessor, EventResult } from "./thalamus/index.js"
export { EventProcessorTag } from "./thalamus/index.js"
export type { SituationClassifier } from "./thalamus/index.js"
export { SituationClassifierTag } from "./thalamus/index.js"
export type { ProcessedContext, ContextHandler } from "./thalamus/index.js"
export { ContextHandlerTag } from "./thalamus/index.js"

// ── AMYGDALA ── Threat detection: interrupt evaluation and alerting
export type { InterruptRule, InterruptRegistry } from "./amygdala/index.js"
export { InterruptRegistryTag, createInterruptRegistry } from "./amygdala/index.js"

// ── HYPOTHALAMUS ── Homeostatic regulation: timing, cycle execution
export type { TurnConfig, TurnResult, CycleConfig, CycleResult } from "./hypothalamus/index.js"
export { runCycle } from "./hypothalamus/index.js"
export type { TempoConfig } from "./hypothalamus/index.js"

// ── HIPPOCAMPUS ── Memory consolidation: dream compression
export type { DreamType, DreamInput, DreamOutput } from "./hippocampus/index.js"
export { dream } from "./hippocampus/index.js"
