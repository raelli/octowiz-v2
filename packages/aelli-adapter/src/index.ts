import type { Review, Room, RoomState, Task, Validation } from '@octowiz/schemas'

export interface EscalationDecision {
  escalate: boolean
  /** Human-readable justification, present only when `escalate` is true. */
  reason?: string
}

/**
 * Should this task be escalated to ÆLLI, and why?
 *
 * A small, explicit rule set — not a config engine. The first matching rule wins:
 *
 * 1. The latest validation for the task failed.
 * 2. A reviewer's latest verdict is a rejection.
 * 3. The task is blocked.
 *
 * "Latest" follows ledger APPEND order (`.at(-1)` / last write per reviewer), exactly as
 * `@octowiz/doctrine` defines it — NOT the caller-supplied `createdAt`, which the reducer
 * never validates for monotonicity. Consulting `createdAt` would let a replayed or
 * clock-skewed event mask a more recent failure.
 *
 * `changes_requested` is deliberately NOT a trigger: it is the normal review loop, not a
 * situation that warrants pulling in ÆLLI. Only a hard `rejected` blocks.
 *
 * Any reviewer's rejection triggers; unlike `@octowiz/doctrine`'s merge-readiness, escalation
 * does NOT require the reviewer to be qualified (`canReview`). Escalating liberally is the
 * safe direction — over-escalating a ghost's rejection is cheap; missing a real block is not.
 *
 * An unknown task does not escalate — there is nothing to act on. Pure: no I/O.
 */
export function shouldEscalate(state: RoomState, taskId: string): EscalationDecision {
  const task = state.tasks.find(t => t.id === taskId)
  if (task === undefined)
    return { escalate: false }

  const latestValidation = state.validations.filter(v => v.taskId === taskId).at(-1)
  if (latestValidation?.status === 'failed')
    return { escalate: true, reason: 'latest validation failed' }

  // Only a reviewer's latest verdict counts; an approval can clear an earlier rejection.
  // A Map keeps insertion position on overwrite, giving "last appended per reviewer wins".
  const latestByReviewer = new Map<string, Review['verdict']>()
  for (const r of state.reviews) {
    if (r.taskId === taskId)
      latestByReviewer.set(r.reviewerId, r.verdict)
  }
  if ([...latestByReviewer.values()].includes('rejected'))
    return { escalate: true, reason: 'a review rejected the task' }

  if (task.status === 'blocked')
    return { escalate: true, reason: 'task is blocked' }

  return { escalate: false }
}

/**
 * A self-contained request payload handed to ÆLLI. Built purely from already-loaded
 * `RoomState` — no fetching, no side effects. This is the INPUT to ÆLLI, distinct from
 * the `Escalation` recorded as output (see #33, which sends it and records the result).
 */
export interface AelliEscalationRequest {
  room: Room
  task: Task
  /** Reviews for this task only, in ledger append order. */
  reviews: Review[]
  /** Validations for this task only, in ledger append order. */
  validations: Validation[]
  /** The escalation justification, when a trigger fired. */
  reason?: string
}

/**
 * Shape the room context for `taskId` into an ÆLLI request payload, filtered to the task's
 * own reviews and validations. Carries the escalation reason (if any) alongside the context.
 *
 * Throws for an unknown task — building a payload for a nonexistent task is a caller bug.
 * Pure: no I/O.
 */
export function buildEscalationRequest(state: RoomState, taskId: string): AelliEscalationRequest {
  const task = state.tasks.find(t => t.id === taskId)
  if (task === undefined)
    throw new Error(`task "${taskId}" not found`)

  return {
    room: state.room,
    task,
    reviews: state.reviews.filter(r => r.taskId === taskId),
    validations: state.validations.filter(v => v.taskId === taskId),
    reason: shouldEscalate(state, taskId).reason,
  }
}
