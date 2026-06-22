import type { RoomLedger } from '@octowiz/room-ledger'
import type { Participant, ParticipantRole, ReviewVerdict, RoomState } from '@octowiz/schemas'
import { canReview } from '@octowiz/doctrine'
import { ParticipantRoleSchema } from '@octowiz/schemas'

export { type AelliRouterWorkerConfig, createAelliRouterWorker, parseRouterResult } from './aelli-router-worker'

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

/** Why the runtime is escalating, plus the room/task it concerns — the input to the handoff. */
export interface EscalationHandoffRequest {
  roomId: string
  taskId: string
  reason: string
}

/**
 * The ÆLLI escalation handoff seam: a single injected async function that takes the escalation
 * context and returns ÆLLI's recommendation as a string. Redefined locally — the same stance as
 * `Run`/`AgentWorker` above — so agent-runtime takes no dependency on another package just for a
 * type, and stays unit-testable with a fake (no real ÆLLI client, transport, or network).
 *
 * Deliberately NOT `@octowiz/aelli-adapter`'s `AelliClient`: that seam takes a heavy
 * `AelliEscalationRequest` (room + task + every review/validation) derived from a full
 * `RoomState`, which is M9b's flow. The dispatch path only has `roomId/taskId/reason`, so reusing
 * it would force agent-runtime to re-load state and rebuild that payload — the opposite of a thin
 * seam, and the M9b duplication #32 warns against.
 */
export type EscalationHandoff = (request: EscalationHandoffRequest) => Promise<string>

/** Everything the escalation handoff path needs — `DispatchInput` plus the handoff seam. */
export interface HandoffEscalationInput {
  ledger: RoomLedger
  worker: AgentWorker
  handoff: EscalationHandoff
  roomId: string
  participant: Participant
  taskId: string
  prompt: string
  at: string
}

/**
 * The ÆLLI escalation handoff path: run the advisor's work, and if it fails — the
 * canonical escalation condition ("the local worker fails") — hand off through the injected
 * `handoff` seam and record the escalation via the existing `escalation.recorded` ledger event,
 * so the recommendation is immediately visible in room state.
 *
 * Topology, decided explicitly so it doesn't overlap the M6a `dispatch` spine (which records
 * advisor output as an escalation UNCONDITIONALLY): this is the CONDITIONAL fallback. A
 * successful worker run passes through unchanged — the seam is never called and nothing is
 * recorded; the current `RoomState` is returned. Only a worker failure triggers the handoff.
 *
 * Fails closed, mirroring `aelli-adapter`'s `recordAelliEscalation`: the ledger is written only
 * after the seam answers, so a rejecting handoff records nothing and the rejection propagates —
 * a lost handoff must never look like a recorded escalation.
 *
 * `reason` is the worker's failure; `recommendation` is what the handoff seam returned. `at` is a
 * caller-supplied ISO timestamp (pure core), and the escalation id is derived from the dispatch
 * coordinates the same way as `dispatch`, since the ledger rejects duplicate ids.
 */
export async function handoffEscalation(input: HandoffEscalationInput): Promise<RoomState> {
  const { ledger, worker, handoff, roomId, participant, taskId, prompt, at } = input
  if (!participant.roles.includes('advisor'))
    throw new Error(`handoffEscalation requires the advisor role; "${participant.id}" holds [${participant.roles.join(', ')}]`)

  try {
    await worker({ role: 'advisor', prompt })
  }
  catch (error) {
    const reason = `agent escalated: ${error instanceof Error ? error.message : String(error)}`
    const recommendation = await handoff({ roomId, taskId, reason })
    const id = `esc-${roomId}-${taskId}-${participant.id}-${at}`
    return ledger.recordEscalation(
      roomId,
      { id, roomId, taskId, reason, recommendation, createdAt: at },
      at,
    )
  }

  // The worker handled it: no escalation condition fired, so pass through unchanged.
  const state = await ledger.getState(roomId)
  if (state === null)
    throw new Error(`room "${roomId}" has no state`)
  return state
}

/**
 * The injected exec seam, identical in shape to sandbox-runtime's `Run`: a single function the
 * caller supplies to shell out to a binary. Redefined locally — same as every other adapter
 * (`zellij-adapter`, `github-adapter`, `validation`) — so agent-runtime takes no dependency on
 * another package just for a type. Faked in tests; the real exec is wired at the composition root.
 */
export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

/**
 * How to invoke the local model CLI. Unlike podman/docker there is no canonical binary name, so
 * the `command` is caller-supplied. `args` are fixed leading flags (e.g. `['--model', 'q4']`)
 * placed ahead of the per-dispatch `--role`/`--prompt`.
 */
export interface LocalModelWorkerConfig {
  command: string
  args?: readonly string[]
}

/**
 * A concrete `AgentWorker` backed by a local model CLI, the local-model analogue of
 * `createPodmanProvider`/`createDockerProvider`: it builds the argv, shells out through the
 * injected `Run`, and maps the process output to `AgentOutput`. A thin seam — no model download,
 * lifecycle, or process management, and no real model or network (tests inject a stub `Run`).
 *
 * `Run` has no stdin, so the prompt and role both travel through argv as `--role`/`--prompt`.
 * A non-zero exit throws with the captured stderr (sandbox-runtime's error discipline); an empty
 * stdout on a clean exit also throws rather than recording an empty agent output downstream.
 */
export function createLocalModelWorker(run: Run, config: LocalModelWorkerConfig): AgentWorker {
  const { command, args = [] } = config
  return async ({ role, prompt }) => {
    const r = await run(command, [...args, '--role', role, '--prompt', prompt])
    if (r.code !== 0)
      throw new Error(`local model worker "${command}" exited ${r.code}: ${r.stderr}`)
    const text = r.stdout.trim()
    if (text === '')
      throw new Error(`local model worker "${command}" produced no output`)
    return { text }
  }
}
