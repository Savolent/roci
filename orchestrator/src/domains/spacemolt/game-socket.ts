// Re-export GameSocket from services — the service itself is already domain-specific.
// This file exists so domain code can import from within the domain directory.
export { GameSocket, GameSocketError, makeGameSocketLive } from "../../services/GameSocket.js"
export type { GameSocketConnection } from "../../services/GameSocket.js"
