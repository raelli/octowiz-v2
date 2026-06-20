import type { Review, RoomState } from '@octowiz/schemas'

/**
 * No self-review: a reviewer may review a task only if they are a known participant
 * holding the reviewer role and are not the task's implementer.
 */
export function canReview(state: RoomState, taskId: string, reviewerId: string): boolean {
  const task = state.tasks.find(t => t.id === taskId)
  if (task === undefined)
    return false
  if (task.implementerId === reviewerId)
    return false
  const reviewer = state.participants.find(p => p.id === reviewerId)
  if (reviewer === undefined)
    return false
  return reviewer.roles.includes('reviewer')
}

export interface MergeReadiness {
  ready: boolean
  reasons: string[]
}

/**
 * Merge readiness: the latest validation for the task must have passed, and at least
 * one approving review must exist from someone other than the implementer.
 * `reasons` lists every unmet condition (empty when ready).
 *
 * ponytail: waiver rules deferred — add a `waivers` argument when a real waiver flow
 * exists and let an active waiver satisfy the matching reason.
 */
export function isMergeReady(state: RoomState, taskId: string): MergeReadiness {
  const task = state.tasks.find(t => t.id === taskId)
  if (task === undefined)
    return { ready: false, reasons: [`task "${taskId}" not found`] }

  const reasons: string[] = []

  // A merged or blocked task is not a merge candidate regardless of validation and
  // approvals. Only these two statuses are terminal here — the positive prerequisites
  // (validation, approval) are checked separately, so we don't require a specific status.
  if (task.status === 'merged')
    reasons.push('task already merged')
  else if (task.status === 'blocked')
    reasons.push('task is blocked')

  // An unassigned task has no work to merge — and without an implementer, canReview's
  // self-review exclusion is vacuous, so require assignment explicitly.
  if (task.implementerId === undefined)
    reasons.push('task has no implementer')

  const latestValidation = state.validations.filter(v => v.taskId === taskId).at(-1)
  if (latestValidation === undefined)
    reasons.push('no validation recorded')
  else if (latestValidation.status !== 'passed')
    reasons.push('latest validation did not pass')

  // Only a reviewer's LATEST verdict counts: an approval later overturned by
  // rejected/changes_requested no longer qualifies. state.reviews is appended in
  // chronological order (room-ledger reducer), so the last entry per reviewer wins —
  // Map keeps insertion position on overwrite, giving "last occurrence wins" for free.
  const latestByReviewer = new Map<string, Review['verdict']>()
  for (const r of state.reviews) {
    if (r.taskId === taskId)
      latestByReviewer.set(r.reviewerId, r.verdict)
  }
  // A qualifying approval must come from someone allowed to review this task:
  // a participant holding the reviewer role who is not the implementer (canReview).
  // Checking only `reviewerId !== implementerId` would let unauthorized or ghost
  // reviewers satisfy merge-readiness, defeating the no-self-review doctrine.
  const hasQualifiedApproval = [...latestByReviewer].some(
    ([reviewerId, verdict]) => verdict === 'approved' && canReview(state, taskId, reviewerId),
  )
  if (!hasQualifiedApproval)
    reasons.push('no approving review from a qualified reviewer')

  return { ready: reasons.length === 0, reasons }
}
