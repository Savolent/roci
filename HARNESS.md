# Agent Harness

The harness runs autonomous SpaceMolt game sessions inside Docker containers, using Claude Code as the agent runtime. Each session: compress the diary, collect game state, generate a briefing, then hand control to Claude.

## Session Flow

```
play.sh <character>
  |
  docker run ... bash /opt/devcontainer/entrypoint.sh
    |
    +-- Setup mode: firewall, wait for auth, game loop
          |
          +-- Session mode (--session), repeats every PLAY_INTERVAL:
                |
                1. dream.ts        Compress diary/secrets via claude -p --model opus
                2. gather-context.ts   Collect game state, generate NL briefing
                3. claude -p           Run agent session with briefing + diary
                      |
                      stream-demux.py    Split stream-json into logs
```

## Components

### TypeScript Harness (`harness/`)

Runs before the agent wakes up. Mounted at `/opt/harness/` (invisible to the agent).

**gather-context.ts** — Replaces the old bash gather-context.sh with richer sensing:
- Authenticates via the game API directly (parses `Username: / Password:` credentials)
- Parallel API queries: status, POI, system, cargo (+ market, missions, orders, storage when docked)
- Classifies situation: Docked / InSpace / InTransit / InCombat
- Detects priority alerts: critical (combat, hull <20%), high (low fuel/hull), medium (cargo full, completable missions), low (cargo nearly full, unread chat)
- Fetches galaxy map for system name resolution
- Collects social state (chat history, forum threads)
- Generates a natural language briefing with market prices, nearby ships, mission status
- Outputs structured markdown to stdout

**dream.ts** — Diary compression between sessions:
- Rolls dream type: nightmare (compresses SECRETS.md), good dream (nurturing DIARY.md compression), or normal
- Nightmare chance scales with secrets length (up to 15%)
- Pipes content through `claude -p --model opus` for compression

### Infrastructure (`.devcontainer/`)

Mounted at `/opt/devcontainer/` (invisible to the agent).

- **entrypoint.sh** — Session runner. Setup mode waits for auth, then loops sessions. Session mode runs dream, gather-context, injects briefing + diary into session-prompt.txt, launches claude.
- **stream-demux.py** — Parses claude's stream-json output into:
  - `thoughts.log` — Agent text, tool calls (shows raw commands), tool results (40-line snip)
  - `raw.jsonl` — Full stream-json for debugging
- **session-prompt.txt** — Template with `{{BRIEFING}}` and `{{DIARY}}` placeholders
- **dream-prompt.txt / good-dream-prompt.txt / nightmare-prompt.txt** — Compression prompts
- **Dockerfile** — node:20 + bun + Claude Code + zsh + firewall tools
- **init-firewall.sh** — Whitelists GitHub, npm, Anthropic, SpaceMolt; blocks everything else

## Container Layout

What the agent sees (`/work/`):

| Path | Purpose | Writable |
|------|---------|----------|
| `me/` | Credentials, background, diary, secrets, values | yes |
| `workspace/` | sm CLI, scripts, data | yes |
| `docs/` | Game documentation | yes |
| `CLAUDE.md` | Agent instructions | no |
| `.claude/` | Claude Code settings | no |

What the agent doesn't see (`/opt/`):

| Path | Purpose |
|------|---------|
| `/opt/devcontainer/` | Entrypoint, prompts, demux, firewall |
| `/opt/harness/` | TypeScript sensing harness |
| `/opt/logs/` | Session logs (thoughts.log, raw.jsonl) |

## Monitoring

```bash
# Watch agent thoughts in real-time (play.sh does this automatically)
tail -f players/<character>/logs/thoughts.log

# Debug with full stream-json
tail -f players/<character>/logs/raw.jsonl

# Press 'r' in play.sh to restart the current session
# Ctrl-C in play.sh to pause the container
```

## Commands

```bash
./play.sh <character>                  # Start or resume
./play.sh <character> --interval 60    # Custom session interval (seconds)
./play.sh <character> stop             # Pause container
./play.sh <character> destroy          # Remove container (needs rebuild)
```
