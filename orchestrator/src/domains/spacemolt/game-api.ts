// Re-export GameApi from services — the service itself is already domain-specific.
// This file exists so domain code can import from within the domain directory.
export { GameApi, GameApiError, makeGameApiLive } from "../../services/GameApi.js"
