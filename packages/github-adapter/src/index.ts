import type { RoomState } from '@octowiz/schemas'
import { isMergeReady } from '@octowiz/doctrine'

export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

/**
 * Create a local feature branch and push it upstream, both through the injected `Run`.
 * `git switch -c` over the older `checkout -b` (git ≥ 2.23). A non-zero exit on either
 * step throws with the captured stderr, matching the adapter convention — and the push
 * is skipped if the branch could not be created.
 *
 * Create-or-reuse: `openPullRequestForBranch` creates+pushes the branch BEFORE
 * `gh pr create`, so if `gh pr create` later fails (expired auth, transient network, PR
 * already exists) the branch survives. A naive `switch -c` would then throw "already
 * exists" on the next `deliver`, wedging the task (not merged, not re-deliverable without
 * a manual `git branch -D`). So if `switch -c` fails *because the branch already exists*,
 * fall back to `git switch <branch>` to reuse it; any other create failure still throws.
 */
export async function createBranch(branch: string, run: Run): Promise<void> {
  const created = await run('git', ['switch', '-c', branch])
  if (created.code !== 0) {
    if (!/already exists/i.test(created.stderr))
      throw new Error(`failed to create branch ${branch}: exit ${created.code}${created.stderr ? `: ${created.stderr}` : ' (no stderr)'}`)
    const switched = await run('git', ['switch', branch])
    if (switched.code !== 0)
      throw new Error(`failed to switch to existing branch ${branch}: exit ${switched.code}${switched.stderr ? `: ${switched.stderr}` : ' (no stderr)'}`)
  }
  const pushed = await run('git', ['push', '-u', 'origin', branch])
  if (pushed.code !== 0)
    throw new Error(`failed to push branch ${branch}: exit ${pushed.code}${pushed.stderr ? `: ${pushed.stderr}` : ' (no stderr)'}`)
}

export interface PullRequestOptions {
  /** Branch to open the PR from. */
  head: string
  /** Branch to merge into. */
  base: string
  title: string
  // ponytail: body is a caller-supplied string. PR-body generation (templates, validation
  // and review summaries) is issue #28 — deliberately not built here.
  body: string
}

/**
 * Open a pull request via `gh pr create` through the injected `Run` and return the PR URL.
 * `gh` prints the URL on its own line; take the last non-empty stdout line so a stray
 * warning cannot corrupt it, and fail loudly on empty output rather than return a useless
 * value. A non-zero exit throws with the captured stderr.
 */
export async function openPullRequest(opts: PullRequestOptions, run: Run): Promise<string> {
  const result = await run('gh', [
    'pr',
    'create',
    '--base',
    opts.base,
    '--head',
    opts.head,
    '--title',
    opts.title,
    '--body',
    opts.body,
  ])
  if (result.code !== 0)
    throw new Error(`failed to open pull request for ${opts.head}: exit ${result.code}${result.stderr ? `: ${result.stderr}` : ' (no stderr)'}`)
  const url = result.stdout.trim().split('\n').map(line => line.trim()).filter(Boolean).at(-1) ?? ''
  if (url === '')
    throw new Error(`gh pr create for ${opts.head} returned no pull request url`)
  return url
}

export interface BranchPullRequestOptions {
  /** Feature branch to create, push, and open the PR from. */
  branch: string
  /** Branch to merge into. */
  base: string
  title: string
  body: string
}

/**
 * The branch + PR workflow: create and push the feature branch, then open the PR from it.
 * If branch creation or push fails, the PR is never opened. Returns the PR URL.
 */
export async function openPullRequestForBranch(opts: BranchPullRequestOptions, run: Run): Promise<string> {
  await createBranch(opts.branch, run)
  return openPullRequest({ head: opts.branch, base: opts.base, title: opts.title, body: opts.body }, run)
}

/** Render the validation section: the checks of the LATEST validation for the task. */
function renderValidation(state: RoomState, taskId: string): string {
  // "Latest" must mean the same validation isMergeReady judges (`filter(...).at(-1)`),
  // otherwise the body could show all-green checks while merge-readiness reports a failure.
  const latest = state.validations.filter(v => v.taskId === taskId).at(-1)
  if (latest === undefined)
    return '## Validation\n\nNo validation has run for this task.'
  if (latest.checks.length === 0)
    return `## Validation\n\nOverall: **${latest.status}** (no individual checks recorded).`
  const rows = latest.checks
    .map(c => `- ${c.status === 'passed' ? '✅' : '❌'} \`${c.name}\` — ${c.status}`)
    .join('\n')
  return `## Validation\n\nOverall: **${latest.status}**\n\n${rows}`
}

/** Render the review section: the LATEST verdict per reviewer, in first-seen order. */
function renderReview(state: RoomState, taskId: string): string {
  // Match isMergeReady's "latest verdict per reviewer" so the summary cannot contradict
  // merge-readiness. A Map preserves first-seen insertion order on overwrite, keeping the
  // output deterministic for a given input array.
  const latestByReviewer = new Map<string, string>()
  for (const r of state.reviews) {
    if (r.taskId === taskId)
      latestByReviewer.set(r.reviewerId, r.verdict)
  }
  if (latestByReviewer.size === 0)
    return '## Review\n\nNo review has been recorded for this task.'
  const rows = [...latestByReviewer]
    .map(([reviewerId, verdict]) => {
      const reviewer = state.participants.find(p => p.id === reviewerId)
      const who = reviewer === undefined ? reviewerId : `${reviewer.displayName} (\`${reviewerId}\`)`
      return `- ${who} — **${verdict}**`
    })
    .join('\n')
  return `## Review\n\n${rows}`
}

/** Render the merge-readiness section straight from `doctrine.isMergeReady`. */
function renderMergeReadiness(state: RoomState, taskId: string): string {
  // Consume doctrine — never reimplement the merge-readiness rules here. Render the
  // `ready` flag and every unmet `reason` it returns.
  const { ready, reasons } = isMergeReady(state, taskId)
  if (ready)
    return '## Merge readiness\n\n✅ **Ready to merge.** All conditions are satisfied.'
  const rows = reasons.map(reason => `- ❌ ${reason}`).join('\n')
  return `## Merge readiness\n\n🚫 **Not ready to merge.** Unmet conditions:\n\n${rows}`
}

/**
 * Generate a deterministic pull-request body (markdown) summarising a task's delivery
 * state: a validation summary (the latest validation's per-check pass/fail results), a
 * review summary (the latest verdict per reviewer), and an explicit merge-readiness
 * section rendered from `doctrine.isMergeReady` — the `ready` flag plus its `reasons`.
 *
 * Pure: derives solely from the supplied in-memory state, with no `Run`, I/O, or network,
 * so it is unit-testable with plain-data fixtures. For an unknown task it still produces a
 * valid body whose merge-readiness section carries doctrine's "task not found" reason.
 *
 * @param state The projected room state to read tasks, validations, and reviews from.
 * @param taskId The id of the task to summarise.
 * @returns The pull-request body as markdown.
 */
export function generatePullRequestBody(state: RoomState, taskId: string): string {
  const task = state.tasks.find(t => t.id === taskId)
  const title = task === undefined ? taskId : task.title
  const header = `# ${title}\n\nTask \`${taskId}\` in room **${state.room.name}**.`
  return [
    header,
    renderValidation(state, taskId),
    renderReview(state, taskId),
    renderMergeReadiness(state, taskId),
  ].join('\n\n')
}
