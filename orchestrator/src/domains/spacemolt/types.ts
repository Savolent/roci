// Re-export harness types used throughout the SpaceMolt domain adapter.
export type {
  GameState,
  Situation,
  SituationType,
  Alert,
  ChatMessage,
  PlayerState,
  ShipState,
  NearbyPlayer,
  Credentials,
} from "../../../../harness/src/types.js"
export { SituationType as SituationTypeEnum } from "../../../../harness/src/types.js"

export type {
  GameEvent,
  StateUpdateEvent,
  CombatUpdateEvent,
  ChatMessageEvent,
} from "../../../../harness/src/ws-types.js"
