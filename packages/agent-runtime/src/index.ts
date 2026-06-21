import type { RoomLedger } from '@octowiz/room-ledger'
import type { Participant, ParticipantRole, ReviewVerdict, RoomState } from '@octowiz/schemas'
import { canReview } from '@octowiz/doctrine'
import { ParticipantRoleSchema } from '@octowiz/schemas'

/** One of the assignable agent roles: every schema role except the non-agent `steward`. */
export type AgentRole = Exclude<ParticipantRole, 'steward'>

/**
 * The assignable agent roles — derived from `@octowiz/schemas`'
 * `ParticipantRoleSchema` by dropping the non-agent `steward` role, never redefined, so
 * the vocabulary stays single-sourced and can't silently drift if the schema grows a role.
 */
export const AGENT_ROLES: readonly AgentRole[] = ParticipantRoleSchema.options.filter(
  (role): role is AgentRole => role !== 'steward',
)

function isAgentRole(role: ParticipantRole): role is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(role)
}

/**
 * Tag a participant with an agent role, returning a new participant (the input is left
 * untouched). Only the four agent roles are assignable — `steward` and unknown values
 * are rejected at the boundary. Re-assigning a held role is a no-op rather than a
 * duplicate.
 */
export function assignRole(participant: Participant, role: AgentRole): Participant {
  if (!isAgentRole(role))
    throw new Error(`"${role}" is not an assignable agent role`)
  if (participant.roles.includes(role))
    return participant
  return { ...participant, roles: [...participant.roles, role] }
}

/** What a worker produces for a dispatch — just its text output for the spine. */
export interface AgentOutput {
  text: string
}

/** Context handed to the worker for a single dispatch. */
export interface AgentWorkerInput {
  role: AgentRole
  prompt: string
}

/**
 * The injected model-worker seam. Mirrors sandbox-runtime's `Run`: a single function the
 * caller supplies, so dispatch is unit-testable with a stub and never touches a real model
 * or the network. The real local/escalation worker is wired at the composition root.
 */
export type AgentWorker = (input: AgentWorkerInput) => Promise<AgentOutput>

/** Everything dispatch needs. `at` is a caller-supplied ISO timestamp (pure core). */
export interface DispatchInput {
  ledger: RoomLedger
  worker: AgentWorker
  roomId: string
  participant: Participant
  taskId: string
  prompt: string
  at: string
}

/**
 * The dispatch-and-record tracer: run a role-tagged participant's work through the injected
 * worker and record the result to the room ledger, returning the projected room state so the
 * output is directly visible.
 *
 * Scope (#27): the spine demonstrates the path with the advisor role, whose output is
 * recorded as an escalation — the escalation handoff the milestone calls out for reuse, and
 * the loosest ledger event to record. The implementer/reviewer/validator recording paths are
 * the separate b/c/d slices and are deliberately not built here.
 */
export async function dispatch(input: DispatchInput): Promise<RoomState> {
  const { ledger, worker, roomId, participant, taskId, prompt, at } = input
  if (!participant.roles.includes('advisor'))
    throw new Error(`dispatch requires the advisor role; "${participant.id}" holds [${participant.roles.join(', ')}]`)

  const output = await worker({ role: 'advisor', prompt })

  // A stable, collision-resistant id from the dispatch coordinates: the ledger rejects
  // duplicate escalation ids, so two dispatches at the same instant for the same task would
  // otherwise clash — include the participant to keep them distinct.
  const id = `esc-${roomId}-${taskId}-${participant.id}-${at}`
  return ledger.recordEscalation(
    roomId,
    { id, roomId, taskId, reason: output.text, createdAt: at },
    at,
  )
}

/**
 * Everything the reviewer dispatch path needs. Like `DispatchInput` plus the review
 * coordinates the worker seam can't supply: `verdict` and `reviewId` are caller-supplied
 * (the same "pure core" stance as `at`), since deriving a verdict from model output is the
 * #31 model-worker slice, not this guard. The worker's text becomes the review notes.
 */
export interface DispatchReviewInput {
  ledger: RoomLedger
  worker: AgentWorker
  roomId: string
  participant: Participant
  taskId: string
  prompt: string
  reviewId: string
  verdict: ReviewVerdict
  at: string
}

/**
 * Reviewer dispatch with a no-self-review guard. Before any worker call or recorded review,
 * the no-self-review rule is CONSUMED from doctrine (`canReview`): the rule lives in one
 * place — a reviewer may review only if they are a known participant holding the reviewer
 * role and are not the task's implementer. A failing check refuses the dispatch (throws)
 * with no worker invocation and no recorded output. Otherwise it runs the worker in the
 * reviewer role and records the review via the M6a dispatch spine.
 */
export async function dispatchReview(input: DispatchReviewInput): Promise<RoomState> {
  const { ledger, worker, roomId, participant, taskId, prompt, reviewId, verdict, at } = input
  const state = await ledger.getState(roomId)
  if (state === null)
    throw new Error(`room "${roomId}" has no state`)
  if (!canReview(state, taskId, participant.id))
    throw new Error(`"${participant.id}" may not review task "${taskId}" (no self-review)`)

  const output = await worker({ role: 'reviewer', prompt })
  return ledger.recordReview(
    roomId,
    { id: reviewId, taskId, reviewerId: participant.id, verdict, notes: output.text, createdAt: at },
    at,
  )
}
