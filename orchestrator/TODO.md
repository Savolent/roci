# GitHub Domain — Remaining Work

## Done

- [x] Fix auth header (`Bearer` → `token` scheme for PATs)
- [x] Fix error handling — log actual errors instead of swallowing
- [x] Include GitHub response body in API error messages
- [x] Add token validation (catch placeholder/empty tokens early)
- [x] Implement stalePRs check (was a TODO stub)
- [x] Replace credentials.txt with github.json (`{ token, repos }`)
- [x] Multi-repo support — brain sees all repos, subagent gets scoped to one
- [x] Per-repo cloning at startup (idempotent — fetches if exists)
- [x] Clones persist via volume mount (players/ → /work/players)
- [x] Situation classifier aggregates across repos (worst-case wins)
- [x] Interrupts aggregate across repos
- [x] Renderer shows per-repo state
- [x] Prompts: brain reviews landscape, subagent works in one clone

## Next Steps

- [ ] Test with a real GitHub token and repos
- [ ] Add `gh auth login --with-token` in container setup so `gh` CLI works alongside git
- [ ] Future: deliberation phase — invoke multiple characters around a shared context
- [ ] Future: characters review each other's PRs (orchestrator awareness of PR authorship)
