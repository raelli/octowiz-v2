import type { RoomState } from '@octowiz/schemas'

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

  const latestValidation = state.validations.filter(v => v.taskId === taskId).at(-1)
  if (latestValidation === undefined)
    reasons.push('no validation recorded')
  else if (latestValidation.status !== 'passed')
    reasons.push('latest validation did not pass')

  // A qualifying approval must come from someone allowed to review this task:
  // a participant holding the reviewer role who is not the implementer (canReview).
  // Checking only `reviewerId !== implementerId` would let unauthorized or ghost
  // reviewers satisfy merge-readiness, defeating the no-self-review doctrine.
  const hasQualifiedApproval = state.reviews.some(
    r => r.taskId === taskId && r.verdict === 'approved' && canReview(state, taskId, r.reviewerId),
  )
  if (!hasQualifiedApproval)
    reasons.push('no approving review from a qualified reviewer')

  return { ready: reasons.length === 0, reasons }
}
