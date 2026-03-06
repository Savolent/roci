import { Layer } from "effect"
import type { InterruptRule } from "../../core/interrupt.js"
import { InterruptRegistryTag, createInterruptRegistry } from "../../core/interrupt.js"
import type { GitHubState } from "./types.js"

const UNTRIAGED_THRESHOLD = 5
const STALE_PR_DAYS = 7

const interruptRules: ReadonlyArray<InterruptRule> = [
  // ── Critical ───────────────────────────────────────────
  {
    name: "ci_failing_main",
    priority: "critical",
    condition: (s) => (s as GitHubState).repos.some((r) => r.ciStatus === "failing"),
    message: (s) => {
      const failing = (s as GitHubState).repos.filter((r) => r.ciStatus === "failing")
      return `CI is failing in: ${failing.map((r) => `${r.owner}/${r.repo}`).join(", ")}. Investigate and fix immediately.`
    },
    suggestedAction: "investigate_ci",
  },

  // ── Medium ─────────────────────────────────────────────
  {
    name: "untriaged_issues",
    priority: "medium",
    condition: (s) => {
      const state = s as GitHubState
      const total = state.repos.reduce((sum, r) =>
        sum + r.openIssues.filter((i) => !i.labels.includes("triaged")).length, 0,
      )
      return total >= UNTRIAGED_THRESHOLD
    },
    message: (s) => {
      const state = s as GitHubState
      const total = state.repos.reduce((sum, r) =>
        sum + r.openIssues.filter((i) => !i.labels.includes("triaged")).length, 0,
      )
      return `${total} untriaged issues across repos need attention.`
    },
    suggestedAction: "triage_issues",
  },

  // ── Low ────────────────────────────────────────────────
  {
    name: "stale_prs",
    priority: "low",
    condition: (s) => {
      const state = s as GitHubState
      const cutoff = Date.now() - STALE_PR_DAYS * 24 * 60 * 60 * 1000
      return state.repos.some((r) =>
        r.openPRs.some((pr) => new Date(pr.createdAt).getTime() < cutoff),
      )
    },
    message: (s) => {
      const state = s as GitHubState
      const cutoff = Date.now() - STALE_PR_DAYS * 24 * 60 * 60 * 1000
      const total = state.repos.reduce((sum, r) =>
        sum + r.openPRs.filter((pr) => new Date(pr.createdAt).getTime() < cutoff).length, 0,
      )
      return `${total} PRs across repos have had no activity in ${STALE_PR_DAYS}+ days.`
    },
    suggestedAction: "review_stale_prs",
  },
]

const gitHubInterruptRegistry = createInterruptRegistry(interruptRules)

/** Layer providing the GitHub interrupt registry. */
export const GitHubInterruptRegistryLive = Layer.succeed(InterruptRegistryTag, gitHubInterruptRegistry)
