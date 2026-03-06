import { Layer } from "effect"
import type { SituationClassifier } from "../../core/situation.js"
import { SituationClassifierTag } from "../../core/situation.js"
import type { GitHubState, GitHubSituation, GitHubSituationType, RepoState, RepoSituation } from "./types.js"

const STALE_PR_DAYS = 7

/** Priority order for situation types (worst first). */
const SITUATION_PRIORITY: GitHubSituationType[] = [
  "ci_failing", "triage_needed", "review_needed", "work_available", "idle",
]

function classifyRepo(state: RepoState): RepoSituation {
  const ciFailing = state.ciStatus === "failing"
  const untriagedIssues = state.openIssues.some((i) => !i.labels.includes("triaged"))
  const reviewablePRs = state.openPRs.some(
    (pr) => !pr.draft && pr.checks === "passing" && pr.reviewStatus === "review_required",
  )
  const cutoff = Date.now() - STALE_PR_DAYS * 24 * 60 * 60 * 1000
  const stalePRs = state.openPRs.some((pr) => new Date(pr.createdAt).getTime() < cutoff)

  const flags = { ciFailing, untriagedIssues, reviewablePRs, stalePRs }

  let type: GitHubSituationType = "idle"
  if (ciFailing) type = "ci_failing"
  else if (untriagedIssues) type = "triage_needed"
  else if (reviewablePRs) type = "review_needed"
  else if (state.openIssues.length > 0) type = "work_available"

  return { owner: state.owner, repo: state.repo, type, flags }
}

function classify(state: GitHubState): GitHubSituation {
  const repos = state.repos.map(classifyRepo)

  // Overall situation = worst across all repos
  const worstType = repos.reduce<GitHubSituationType>((worst, r) => {
    return SITUATION_PRIORITY.indexOf(r.type) < SITUATION_PRIORITY.indexOf(worst)
      ? r.type
      : worst
  }, "idle")

  return { type: worstType, repos, alerts: [] }
}

function briefing(state: GitHubState, situation: GitHubSituation): string {
  const lines = state.repos.map((repo, i) => {
    const sit = situation.repos[i]
    const branch = repo.currentBranch ?? "?"
    return `${repo.owner}/${repo.repo}: ${repo.openIssues.length} issues, ${repo.openPRs.length} PRs, CI:${repo.ciStatus}, branch:${branch} → ${sit?.type ?? "?"}`
  })
  return lines.join("\n")
}

const gitHubSituationClassifier: SituationClassifier = {
  classify(state) {
    return classify(state as GitHubState)
  },
  briefing(state, situation) {
    return briefing(state as GitHubState, situation as GitHubSituation)
  },
}

/** Layer providing the GitHub situation classifier. */
export const GitHubSituationClassifierLive = Layer.succeed(SituationClassifierTag, gitHubSituationClassifier)
