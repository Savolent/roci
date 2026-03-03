# Agent Harness

The harness runs autonomous SpaceMolt game sessions inside a shared Docker container, using Claude Code as the agent runtime. An orchestrator on the host manages the game loop: connect via WebSocket, plan with a brain LLM, dispatch subagents into the container, and capture all output.

## Architecture

```
cli.ts
 └─ runOrchestrator(configs[], domain)              pipeline/orchestrator.ts
     ├─ ensureSharedContainer()                      Start/reuse Docker container
     └─ for each character: fork characterLoop()     pipeline/character-loop.ts
         └─ runPhases(context, phaseRegistry)         core/phase-runner.ts
             ├─ startup: connect WS, dream if needed  domains/spacemolt/phases.ts
             ├─ active: eventLoop(config)              monitor/event-loop.ts
             │   └─ runStateMachine(config)            core/state-machine.ts
             │       ├─ initial planning + spawn
             │       └─ { event loop }
             ├─ social: dinner reflection
             └─ reflection: dream, loop → active
```

### Domain Services

The state machine is domain-agnostic. All domain knowledge is injected via 7 Effect service layers, provided in `event-loop.ts`. See `domains/DOMAIN_GUIDE.md` for full documentation on building new domains.

| Service | Tag | Role |
|---------|-----|------|
| **SituationClassifier** | `SituationClassifierTag` | `classify(state)` → structured situation; `briefing()` → human-readable context |
| **InterruptRegistry** | `InterruptRegistryTag` | Declarative interrupt rules with priority, condition, message, `suppressWhenTaskIs` |
| **SkillRegistry** | `SkillRegistryTag` | Step completion logic — currently a no-op stub (all completion falls through to LLM evaluator) |
| **StateRenderer** | `StateRendererTag` | Snapshots, rich snapshots, diffs, console state bar |
| **PromptBuilder** | `PromptBuilderTag` | Assembles all LLM prompts (plan, interrupt, evaluate, subagent) |
| **EventProcessor** | `EventProcessorTag` | Maps raw WS events to state updates, interrupts, ticks |
| **ContextHandler** | `ContextHandlerTag` | Processes accumulated WS context (chat, combat, death, errors) into structured output |

### Adding an interrupt rule

Add to the rules array in `domains/spacemolt/interrupts.ts`:

```typescript
{ name: "fuel_emergency", priority: "critical",
  condition: (s, sit) => sit.flags.lowFuel && sit.type !== SituationType.Docked,
  message: (s) => `Fuel critical (${s.ship.fuel}). Dock immediately.`,
  suppressWhenTaskIs: "refuel" }
```

### { event loop }

Runs forever, one iteration per event from the WS queue.

```
Queue.take(event)
 │
 ▼
eventProcessor.processEvent(event, state) → EventResult
 ├─ apply stateUpdate to gameStateRef
 ├─ update tickCountRef
 ├─ run log side effect
 ├─ accumulate chat/combat context
 │
 ▼
dispatch on result flags:
 ├─ isReset ─────► handleReset: kill subagent, clear plan
 ├─ isInterrupt ─► { handle interrupt }
 └─ isTick/isStateUpdate ─► { handle heartbeat }
```

### { handle interrupt }

```
killSubagent
 └─ brainInterrupt.execute()
     └─ promptBuilder.interruptPrompt() → LLM → new Plan
```

### { handle heartbeat }

Runs on both tick and state_update events.

```
interrupts.criticals(state, situation, currentTask)
 ├─ if criticals → { handle interrupt }
 │
checkMidRun()
 └─ skills.isStepComplete() (stub: always falls through)
     └─ timeout exceeded → kill fiber, step++
 │
poll subagent fiber
 ├─ if done → { evaluate completed subagent }
 │
{ maybe request plan }
 └─ { maybe spawn subagent }
```

### { evaluate completed subagent }

```
Build diff: renderer.richSnapshot() before vs after
brainEvaluate.execute()
 └─ promptBuilder.evaluatePrompt() → LLM → {complete, reason}
     ├─ complete → step++
     └─ failed → clear plan, set previousFailure
```

### { maybe request plan }

Only runs if no plan and no subagent.

```
Read diary, background, values
brainPlan.execute()
 └─ promptBuilder.planPrompt()
     (includes stepTimingHistory with outcomes + diffs)
     → LLM → Plan{steps[]}
```

### { maybe spawn subagent }

Only runs if plan exists and no fiber running.

```
Save spawnStateRef (renderer.richSnapshot())
runGenericSubagent()                              core/subagent.ts
 └─ promptBuilder.subagentPrompt()
     → claude.execInContainer()
         → Docker exec → Claude Code in shared container
     → fork as Fiber, streams output back
```

## Sequence Diagram: Subagent Execution

```
  Orchestrator          Docker Container          Log Files        Console
  (host)                (roci-crew)
  │                     │                         │                │
  │ docker exec -i      │                         │                │
  │ -e OAUTH_TOKEN=...  │                         │                │
  │────────────────────►│                         │                │
  │  stdin: prompt      │                         │                │
  │                     │ run-step.sh             │                │
  │                     │ cd /work/players/<name> │                │
  │                     │ claude -p --stream-json │                │
  │                     │         │               │                │
  │                     │         │ $ sm status   │                │
  │                     │         │─────────► …   │                │
  │                     │         │◄───────── …   │                │
  │                     │         │ $ sm market   │                │
  │                     │         │─────────► …   │                │
  │                     │         │◄───────── …   │                │
  │                     │         │ $ sm market …│                │
  │                     │         │─────────► …   │                │
  │                     │         │◄───────── …   │                │
  │                     │         │               │                │
  │◄════════════════════╡ stdout: stream-json lines                │
  │  (each line)        │         │               │                │
  │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ►│                │
  │  log.raw(line)      │         │       stream.jsonl (verbatim)  │
  │                     │         │               │                │
  │  parseStreamJson(line)        │               │                │
  │  ├─ ok ──► demuxEvent         │               │                │
  │  │   │─ assistant:text ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ► │
  │  │   │                        │               │  [name:assistant:text]
  │  │   │─ assistant:tool_use ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ► │
  │  │   │                        │               │  [name:assistant:tool_use]
  │  │   │─ user:tool_result ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─► │
  │  │   │                        │               │  [name:user:tool_result]
  │  │   └─ result ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ► │
  │  │                            │               │  [name:result] |
  │  └─ parse fail ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ► │
  │                               │               │  [name:raw]    |
  │                               │               │                │
  │◄════════════════════╡ stream ends             │                │
  │                     │         │               │                │
  │  waitForExit        │         │               │                │
  │  ├─ join stderr fiber         │               │                │
  │  ├─ get exit code   │         │               │                │
  │  │                  │         │               │                │
  │  ├─ exitCode != 0 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ►│
  │  │   fail with ClaudeError    │               │  [name:stderr]
  │  │                  │         │               │  [name:error]
  │  └─ exitCode == 0   │         │               │                │
  │     return text     │         │               │                │
  │                     │         │               │                │
```

## Container Layout

Single shared container `roci-crew`, all characters isolated via `--add-dir`.

**Volume mounts:**

| Host Path | Container Path | Access |
|-----------|---------------|--------|
| `players/` | `/work/players` | RW |
| `shared-resources/workspace/` | `/work/shared/workspace` | RW |
| `shared-resources/spacemolt-docs/` | `/work/shared/spacemolt-docs` | RW |
| `docs/` | `/work/shared/docs` | RW |
| `shared-resources/sm-cli/` | `/work/sm-cli` | RW |
| `.claude/` | `/work/.claude` | RO |
| `.devcontainer/` | `/opt/devcontainer` | RO |
| `scripts/` | `/opt/scripts` | RO |

**What the subagent sees** (via `--add-dir` in `run-step.sh`):

| Path | Purpose |
|------|---------|
| `/work/players/<name>/` | CWD — credentials, background, diary, secrets, values |
| `/work/shared/` | Shared workspace, game docs |
| `/work/sm-cli/` | sm CLI source |

**What the subagent doesn't see:**

| Path | Purpose |
|------|---------|
| `/opt/scripts/` | run-step.sh |
| `/opt/devcontainer/` | Dockerfile, firewall script |

## Log Files

Per character at `players/<name>/logs/`:

| File | Contents | Written by |
|------|----------|-----------|
| `stream.jsonl` | Every raw stdout line, verbatim | `log.raw()` |
| `thoughts.jsonl` | Assistant text blocks (LLM thinking) | `log.thought()` |
| `actions.jsonl` | Tool use, tool results, subagent lifecycle | `log.action()` |
| `words.jsonl` | sm chat/forum commands (social actions) | `log.word()` |

## Console Output

All events printed type-tagged with timestamp and character name:

```
18:04:37 [test-pilot:assistant:text] I'll check the market prices first...
18:04:37 test-pilot: "I'll check the market prices first..."
18:04:38 [test-pilot:assistant:tool_use] Bash: sm market
18:04:38   $ sm market
18:04:39 [test-pilot:user:tool_result] Iron Ore: 5cr/unit (3 buy orders)...
18:04:39   > Iron Ore: 5cr/unit (3 buy orders)...
18:04:45 [test-pilot:result] ok:
18:04:45 [test-pilot:stderr] (if any stderr output)
```

## Commands

```bash
./roci start <character> [character...]    # Build image, start orchestrator
./roci start <char> --tick-interval 60     # Custom tick interval (default 30s)
./roci stop                                # Stop the shared container
./roci pause                               # Pause the shared container
./roci resume                              # Resume the shared container
./roci destroy                             # Remove the shared container
./roci status                              # Show container status
./roci logs <character>                    # Show recent thoughts
```

## Key Files

### Core (domain-agnostic)

| File | Role |
|------|------|
| `core/state-machine.ts` | Plan/act/evaluate event loop |
| `core/brain.ts` | Brain functions: plan, interrupt, evaluate (Opus) |
| `core/subagent.ts` | Build prompt, run in container, handle exit |
| `core/phase.ts` | Phase, PhaseContext, PhaseResult, PhaseRegistry interfaces |
| `core/phase-runner.ts` | Runs phases in sequence, handles Continue/Restart/Shutdown |
| `core/domain-bundle.ts` | DomainBundle type + DomainConfig interface |
| `core/lifecycle.ts` | LifecycleHooks (shouldExit, onInterrupt, onReset) |
| `core/skill.ts` | `Skill` + `SkillRegistry` interface (stub until skills redesign) |
| `core/interrupt.ts` | `InterruptRule` + `InterruptRegistry` interface + `createInterruptRegistry()` factory |
| `core/situation.ts` | `SituationClassifier` interface |
| `core/state-renderer.ts` | `StateRenderer` interface |
| `core/context-handler.ts` | `ContextHandler` interface |
| `core/prompt-builder.ts` | `PromptBuilder` interface + prompt context types |
| `core/event-source.ts` | `EventProcessor` interface |
| `core/types.ts` | Plan, PlanStep, StepTiming, StepCompletionResult, Alert |

### SpaceMolt domain

| File | Role |
|------|------|
| `domains/spacemolt/config.ts` | DomainConfig factory (mounts, image, setup) |
| `domains/spacemolt/index.ts` | Domain bundle (all 7 service layers) + `spaceMoltServiceLayer` |
| `domains/spacemolt/phases.ts` | Phase registry: startup, active, social, reflection |
| `domains/spacemolt/interrupts.ts` | Declarative interrupt rules via `createInterruptRegistry()` |
| `domains/spacemolt/situation.ts` | Classify state + generate briefings (alerts delegated to InterruptRegistry) |
| `domains/spacemolt/renderer.ts` | State snapshots, diffs, console bar |
| `domains/spacemolt/prompt-builder.ts` | All LLM prompt assembly; subagents reference `sm --help` for commands |
| `domains/spacemolt/event-processor.ts` | Maps WS GameEvents to EventResults |
| `domains/spacemolt/context-handler.ts` | Processes chat, combat, death, error context from WS events |
| `domains/spacemolt/state-renderer.ts` | Underlying snapshot/diff functions |
| `domains/spacemolt/game-socket-impl.ts` | WebSocket connection, reconnection, event queue |
| `domains/spacemolt/game-socket.ts` | Re-exports GameSocket tag + types |
| `domains/DOMAIN_GUIDE.md` | Guide for building new domains |

### Pipeline & services

| File | Role |
|------|------|
| `cli.ts` | CLI commands and service wiring |
| `pipeline/orchestrator.ts` | Container lifecycle, fork character fibers |
| `pipeline/character-loop.ts` | Per-character: delegates to phase runner |
| `monitor/event-loop.ts` | Provides domain service layers, delegates to state machine |
| `services/Claude.ts` | Host invoke + container exec with stream/exit |
| `services/ProjectRoot.ts` | Project root path service |
| `services/CharacterFs.ts` | Character file system operations |
| `services/Docker.ts` | Docker container management |
| `logging/log-demux.ts` | Raw capture, parse, route to logs + console |
| `logging/log-writer.ts` | CharacterLog service (JSONL append) |
| `logging/console-renderer.ts` | Type-tagged + narrative console output |
| `scripts/run-step.sh` | In-container: cd to player dir, exec claude -p |
| `.devcontainer/Dockerfile` | Container image: node20, claude-code, firewall |
| `.devcontainer/init-firewall.sh` | iptables whitelist for allowed domains |
