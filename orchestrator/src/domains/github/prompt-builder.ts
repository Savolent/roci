import { Layer } from "effect"
import type {
  PromptBuilder,
  PlanPromptContext,
  InterruptPromptContext,
  EvaluatePromptContext,
  SubagentPromptContext,
} from "../../core/prompt-builder.js"
import { PromptBuilderTag } from "../../core/prompt-builder.js"
import type { GitHubState, GitHubSituation } from "./types.js"

function renderReposSummary(state: GitHubState, situation: GitHubSituation): string {
  return state.repos.map((repo, i) => {
    const sit = situation.repos[i]
    const lines = [
      `### ${repo.owner}/${repo.repo} — ${sit?.type ?? "unknown"}`,
      `CI: ${repo.ciStatus} | Issues: ${repo.openIssues.length} | PRs: ${repo.openPRs.length}`,
    ]
    if (repo.clonePath) {
      lines.push(`Clone: \`${repo.clonePath}\` (branch: ${repo.currentBranch ?? "unknown"})`)
    }

    const untriaged = repo.openIssues.filter((i) => !i.labels.includes("triaged"))
    if (untriaged.length > 0) lines.push(`Untriaged: ${untriaged.length}`)

    const reviewable = repo.openPRs.filter(
      (pr) => !pr.draft && pr.checks === "passing" && pr.reviewStatus === "review_required",
    )
    if (reviewable.length > 0) lines.push(`PRs ready for review: ${reviewable.length}`)

    return lines.join("\n")
  }).join("\n\n")
}

/** List all clone paths for the subagent to know about. */
function renderClonePaths(state: GitHubState): string {
  const clones = state.repos
    .filter((r) => r.clonePath)
    .map((r) => `- \`${r.clonePath}\` — ${r.owner}/${r.repo}`)
  return clones.length > 0 ? clones.join("\n") : "(no clones available)"
}

const gitHubPromptBuilder: PromptBuilder = {
  planPrompt(ctx: PlanPromptContext): string {
    const state = ctx.state as GitHubState
    const situation = ctx.situation as GitHubSituation
    const reposSummary = renderReposSummary(state, situation)

    const failureSection = ctx.previousFailure
      ? `\n## Previous Plan Failed\n${ctx.previousFailure}\n`
      : ""

    return `You are a software engineer maintaining ${state.repos.length} repositor${state.repos.length === 1 ? "y" : "ies"}.

## Repositories
${reposSummary}

${ctx.briefing}

## Your Identity
${ctx.background}

## Your Values
${ctx.values}

## Your Diary
${ctx.diary.slice(-2000)}
${failureSection}
## Task Types
Available task types: triage | code | review | investigate_ci

## Instructions
Review all repositories and create a plan addressing the most pressing needs across them. Prioritize: CI failures > untriaged issues > pending reviews > new work.

When creating steps, specify which repository the work targets in the goal (e.g. "Fix CI in owner/repo"). The subagent will be given the clone path for that repo.

Each tick is ${ctx.tickIntervalSec} seconds. Set realistic timeoutTicks for each step.

Respond with a JSON object:
\`\`\`json
{
  "reasoning": "Why this plan makes sense",
  "steps": [
    {
      "task": "triage|code|review|investigate_ci",
      "goal": "What to accomplish — specify which repo",
      "successCondition": "How to verify completion",
      "timeoutTicks": 5
    }
  ]
}
\`\`\``
  },

  interruptPrompt(ctx: InterruptPromptContext): string {
    const currentPlanSummary = ctx.currentPlan
      ? `Current plan:\n${ctx.currentPlan.steps.map((s, i) => `${i + 1}. [${s.task}] ${s.goal}`).join("\n")}`
      : "No active plan."

    return `INTERRUPT: Critical alerts require immediate attention.

## Alerts
${ctx.alerts.map((a) => `[${a.priority}] ${a.message} (suggested: ${a.suggestedAction ?? "none"})`).join("\n")}

## Current State
${ctx.briefing}

## ${currentPlanSummary}

## Identity
${ctx.background.slice(0, 1000)}

Respond with a new plan as JSON to address the alerts:
\`\`\`json
{
  "reasoning": "Why this plan addresses the alerts",
  "steps": [
    {
      "task": "investigate_ci|triage|code|review",
      "goal": "What to accomplish — specify which repo",
      "successCondition": "How to verify",
      "timeoutTicks": 5
    }
  ]
}
\`\`\``
  },

  evaluatePrompt(ctx: EvaluatePromptContext): string {
    const secondsConsumed = Math.round(ctx.ticksConsumed * ctx.tickIntervalSec)
    const secondsBudgeted = Math.round(ctx.ticksBudgeted * ctx.tickIntervalSec)
    const overrunDelta = ctx.ticksConsumed - ctx.ticksBudgeted
    const overrunWarning = overrunDelta > 0
      ? `\nWARNING: exceeded tick budget by ${overrunDelta} ticks.`
      : ""

    return `Evaluate whether this step was completed successfully.

## Step
Goal: ${ctx.step.goal}
Success condition: ${ctx.step.successCondition}

## Subagent Report
${ctx.subagentReport.slice(-2000)}

## State Changes
${ctx.stateDiff}

## Current State
${JSON.stringify(ctx.state)}

## Condition Check
Condition: "${ctx.step.successCondition}"
Result: ${ctx.conditionCheck.complete ? "PASS" : "FAIL"} - ${ctx.conditionCheck.reason}

## Timing
Consumed ${ctx.ticksConsumed} of ${ctx.ticksBudgeted} ticks (~${secondsConsumed}s of ~${secondsBudgeted}s).${overrunWarning}

Respond with JSON:
\`\`\`json
{
  "complete": true,
  "reason": "Why the step is/isn't complete"
}
\`\`\``
  },

  subagentPrompt(ctx: SubagentPromptContext): string {
    const state = ctx.state as GitHubState
    const situation = ctx.situation as GitHubSituation
    const budgetSeconds = Math.round(ctx.step.timeoutTicks * ctx.identity.tickIntervalSec)

    return `You are working across ${state.repos.length} repositor${state.repos.length === 1 ? "y" : "ies"}.

## Your Task
Type: ${ctx.step.task}
Goal: ${ctx.step.goal}
Success condition: ${ctx.step.successCondition}
Time budget: ${ctx.step.timeoutTicks} ticks (~${budgetSeconds}s)

## Repository Overview
${renderReposSummary(state, situation)}

## Clone Paths
${renderClonePaths(state)}

## Your Identity
${ctx.identity.personality.slice(0, 800)}

## Your Values
${ctx.identity.values.slice(0, 500)}

## Tools
Use the \`gh\` CLI for GitHub operations and \`git\` for repository operations.

## Workflow
- \`cd <clone-path>\` before any git operations on a repo
- Create a feature branch: \`git checkout -b <branch-name>\`
- Make changes, commit, push: \`git push -u origin <branch-name>\`
- Open a PR: \`gh pr create --title "..." --body "..."\`
- Review a PR: \`gh pr review <number> --approve\` or \`--request-changes -b "feedback"\`

Complete your task and report what you did.`
  },

  systemPrompt(): string {
    return `# GitHub Agent

You are a software engineer working across one or more GitHub repositories. You have access to the \`gh\` CLI and \`git\` for all operations.

## Available Tools

- \`gh issue list\` / \`gh issue view <number>\` — browse issues
- \`gh issue edit <number> --add-label <label>\` — triage issues
- \`gh pr list\` / \`gh pr view <number>\` — browse PRs
- \`gh pr review <number> --approve\` / \`--request-changes\` — review PRs
- \`gh pr checkout <number>\` — check out a PR locally
- \`gh run list\` / \`gh run view <id>\` — inspect CI runs
- \`git\` — standard git operations for code changes

## Workflow

You have local clones of your repositories. For coding tasks:
1. \`cd\` to the appropriate clone directory
2. Fetch latest: \`git fetch origin && git checkout main && git pull\`
3. Create a feature branch: \`git checkout -b feature/description\`
4. Make changes, commit with clear messages
5. Push and open a PR: \`git push -u origin HEAD && gh pr create\`

For reviews, use \`gh pr checkout\` to inspect changes locally.

## Working Style

- Read issues and PRs carefully before acting
- Write clear commit messages and PR descriptions
- Run tests before submitting changes
- Be thorough in code reviews — check for correctness, style, and edge cases
- When triaging, add appropriate labels and leave a comment explaining priority

## Diary

Your ./me/DIARY.md tracks your beliefs, accomplishments, and plans across sessions. Update it at the end of each shift.

**never** ask "what should I do?" — you decide based on repository state and your priorities.`
  },
}

/** Layer providing the GitHub prompt builder. */
export const GitHubPromptBuilderLive = Layer.succeed(PromptBuilderTag, gitHubPromptBuilder)
