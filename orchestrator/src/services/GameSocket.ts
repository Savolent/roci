import { Context, Effect, Layer, Queue, Scope, Fiber, Ref, Deferred } from "effect"
import WebSocket from "ws"
import type { Credentials, GameState, NearbyPlayer } from "../../../harness/src/types.js"
import type {
  GameEvent,
  LoggedInEvent,
  ClientMessage,
} from "../../../harness/src/ws-types.js"
import { parseGameEvent } from "../../../harness/src/ws-types.js"

const WS_URL = "wss://game.spacemolt.com/ws"
const RECONNECT_DELAY_MS = 2000
const QUEUE_CAPACITY = 500

export class GameSocketError {
  readonly _tag = "GameSocketError"
  constructor(readonly message: string, readonly cause?: unknown) {}
}

export interface GameSocketConnection {
  /** Queue of incoming game events. Take from this in the event loop. */
  readonly events: Queue.Queue<GameEvent>
  /** Initial game state from the logged_in event. */
  readonly initialState: GameState
}

export class GameSocket extends Context.Tag("GameSocket")<
  GameSocket,
  {
    /**
     * Open a WebSocket connection, authenticate, and start receiving events.
     * Scoped — the connection is closed when the scope finalizes.
     * Returns the event queue and initial state from login.
     */
    readonly connect: (
      creds: Credentials,
      characterName: string,
    ) => Effect.Effect<GameSocketConnection, GameSocketError, Scope.Scope>

    /** Send a message to the server. Must be connected. */
    readonly send: (msg: ClientMessage) => Effect.Effect<void, GameSocketError>
  }
>() {}

/**
 * Build a GameState from the logged_in event payload.
 * The WS logged_in doesn't include everything that collectGameState does,
 * but it gives us the core state to start from.
 */
function buildInitialState(payload: LoggedInEvent["payload"]): GameState {
  return {
    player: payload.player,
    ship: payload.ship,
    poi: payload.poi,
    system: payload.system,
    cargo: payload.ship.cargo,
    nearby: [],
    notifications: [],
    travelProgress: null,
    inCombat: false,
    tick: 0,
    timestamp: Date.now(),
  }
}

export const makeGameSocketLive = () =>
  Layer.succeed(
    GameSocket,
    (() => {
      // Mutable ref to the current WebSocket — shared across connect/send
      let ws: WebSocket | null = null

      return GameSocket.of({
        connect: (creds, characterName) =>
          Effect.gen(function* () {
            const events = yield* Queue.bounded<GameEvent>(QUEUE_CAPACITY)

            // Deferred that resolves with initial state once logged_in arrives
            const loggedInDeferred = yield* Deferred.make<GameState, GameSocketError>()

            // Track whether we've logged in at least once
            const hasLoggedIn = yield* Ref.make(false)

            // Flag to stop reconnect loop on finalization
            const closed = yield* Ref.make(false)

            const connectAndLogin = Effect.gen(function* () {
              yield* Effect.sync(() =>
                console.log(`[${characterName}:ws] Connecting to ${WS_URL}...`),
              )

              const socket = yield* Effect.async<WebSocket, GameSocketError>((resume) => {
                const sock = new WebSocket(WS_URL)

                sock.on("open", () => {
                  resume(Effect.succeed(sock))
                })

                sock.on("error", (err) => {
                  resume(Effect.fail(new GameSocketError("WebSocket connection failed", err)))
                })
              })

              ws = socket

              // Set up message handler
              socket.on("message", (data) => {
                try {
                  const raw = data.toString()
                  const event = parseGameEvent(raw)

                  // If this is the logged_in event, resolve the deferred
                  if (event.type === "logged_in") {
                    const state = buildInitialState((event as LoggedInEvent).payload)
                    Effect.runSync(
                      Deferred.succeed(loggedInDeferred, state).pipe(
                        Effect.catchAll(() => Effect.void), // Already resolved on reconnect
                      ),
                    )
                    Effect.runSync(Ref.set(hasLoggedIn, true))
                  }

                  // Offer to queue (drop-oldest if full via sliding behavior)
                  // Queue.bounded will back-pressure; use offer which drops if full
                  Effect.runFork(
                    Queue.offer(events, event).pipe(
                      Effect.catchAll(() => Effect.void),
                    ),
                  )
                } catch (err) {
                  console.error(`[${characterName}:ws] Failed to parse message: ${err}`)
                }
              })

              // Wait for welcome, then send login
              yield* Effect.async<void, GameSocketError>((resume) => {
                // Welcome should arrive quickly after connect
                const timeout = setTimeout(() => {
                  resume(Effect.fail(new GameSocketError("Timed out waiting for welcome")))
                }, 10000)

                const handler = (data: WebSocket.Data) => {
                  try {
                    const event = parseGameEvent(data.toString())
                    if (event.type === "welcome") {
                      clearTimeout(timeout)
                      socket.removeListener("message", handler)
                      resume(Effect.succeed(undefined))
                    }
                  } catch {
                    // ignore parse errors during welcome wait
                  }
                }

                socket.on("message", handler)
              })

              yield* Effect.sync(() =>
                console.log(`[${characterName}:ws] Received welcome, sending login...`),
              )

              // Send login
              yield* Effect.try({
                try: () =>
                  socket.send(
                    JSON.stringify({
                      type: "login",
                      payload: { username: creds.username, password: creds.password },
                    }),
                  ),
                catch: (e) => new GameSocketError("Failed to send login", e),
              })

              // Set up reconnect handler
              socket.on("close", () => {
                console.log(`[${characterName}:ws] Connection closed`)
                ws = null

                // Reconnect if not intentionally closed
                Effect.runFork(
                  Effect.gen(function* () {
                    const isClosed = yield* Ref.get(closed)
                    if (isClosed) return

                    yield* Effect.sync(() =>
                      console.log(
                        `[${characterName}:ws] Reconnecting in ${RECONNECT_DELAY_MS}ms...`,
                      ),
                    )
                    yield* Effect.sleep(RECONNECT_DELAY_MS)

                    const stillClosed = yield* Ref.get(closed)
                    if (stillClosed) return

                    yield* connectAndLogin.pipe(
                      Effect.catchAll((e) =>
                        Effect.sync(() =>
                          console.error(
                            `[${characterName}:ws] Reconnect failed: ${e.message}`,
                          ),
                        ),
                      ),
                    )
                  }),
                )
              })

              socket.on("error", (err) => {
                console.error(`[${characterName}:ws] Error: ${err.message}`)
              })
            })

            // Initial connection
            yield* connectAndLogin

            // Wait for login response
            const initialState = yield* Deferred.await(loggedInDeferred).pipe(
              Effect.timeoutFail({
                duration: "30 seconds",
                onTimeout: () => new GameSocketError("Timed out waiting for logged_in"),
              }),
            )

            yield* Effect.sync(() =>
              console.log(
                `[${characterName}:ws] Logged in as ${initialState.player.username} in ${initialState.system?.name ?? initialState.player.current_system}`,
              ),
            )

            // Register finalizer to close the WebSocket
            yield* Scope.addFinalizer(
              yield* Effect.scope,
              Effect.gen(function* () {
                yield* Ref.set(closed, true)
                yield* Effect.sync(() => {
                  if (ws) {
                    ws.close()
                    ws = null
                  }
                })
                yield* Queue.shutdown(events)
                yield* Effect.sync(() =>
                  console.log(`[${characterName}:ws] Connection closed (finalized)`),
                )
              }),
            )

            return { events, initialState }
          }),

        send: (msg) =>
          Effect.try({
            try: () => {
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                throw new Error("WebSocket not connected")
              }
              ws.send(JSON.stringify(msg))
            },
            catch: (e) => new GameSocketError("Failed to send message", e),
          }),
      })
    })(),
  )
