export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

/**
 * Create a local feature branch and push it upstream, both through the injected `Run`.
 * `git switch -c` over the older `checkout -b` (git ≥ 2.23). A non-zero exit on either
 * step throws with the captured stderr, matching the adapter convention — and the push
 * is skipped if the branch could not be created.
 */
export async function createBranch(branch: string, run: Run): Promise<void> {
  const created = await run('git', ['switch', '-c', branch])
  if (created.code !== 0)
    throw new Error(`failed to create branch ${branch}: exit ${created.code}${created.stderr ? `: ${created.stderr}` : ' (no stderr)'}`)
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
