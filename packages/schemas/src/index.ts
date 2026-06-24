import { z } from 'zod'

export const SCHEMAS_VERSION = '0.1.0' as const
export type SchemasVersion = typeof SCHEMAS_VERSION

export const ParticipantKindSchema = z.enum(['human', 'agent'])
export type ParticipantKind = z.infer<typeof ParticipantKindSchema>

export const ParticipantRoleSchema = z.enum(['implementer', 'reviewer', 'validator', 'advisor', 'steward'])
export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>

export const ParticipantSchema = z.object({
  id: z.string().min(1),
  kind: ParticipantKindSchema,
  roles: z.array(ParticipantRoleSchema),
  displayName: z.string().min(1),
})
export type Participant = z.infer<typeof ParticipantSchema>

export const RoomStatusSchema = z.enum(['active', 'archived'])
export type RoomStatus = z.infer<typeof RoomStatusSchema>

export const RoomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: RoomStatusSchema,
  createdAt: z.string().min(1),
})
export type Room = z.infer<typeof RoomSchema>

export const TaskStatusSchema = z.enum(['open', 'in_progress', 'in_review', 'validated', 'merged', 'blocked'])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const TaskSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatusSchema,
  implementerId: z.string().min(1).optional(),
})
export type Task = z.infer<typeof TaskSchema>

export const ReviewVerdictSchema = z.enum(['approved', 'rejected', 'changes_requested'])
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>

export const ReviewSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  reviewerId: z.string().min(1),
  verdict: ReviewVerdictSchema,
  notes: z.string().optional(),
  createdAt: z.string().min(1),
})
export type Review = z.infer<typeof ReviewSchema>

export const CheckStatusSchema = z.enum(['passed', 'failed'])
export type CheckStatus = z.infer<typeof CheckStatusSchema>

export const ValidationCheckSchema = z.object({
  name: z.string().min(1),
  status: CheckStatusSchema,
  output: z.string().optional(),
})
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>

export const ValidationSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  status: CheckStatusSchema,
  checks: z.array(ValidationCheckSchema),
  createdAt: z.string().min(1),
})
export type Validation = z.infer<typeof ValidationSchema>

export const EscalationSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  reason: z.string().min(1),
  recommendation: z.string().optional(),
  createdAt: z.string().min(1),
})
export type Escalation = z.infer<typeof EscalationSchema>

export const AdviceSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  taskId: z.string().min(1),
  advisorId: z.string().min(1),
  reviewerId: z.string().min(1),
  tier: z.string().min(1),
  recommendation: z.string().min(1),
  verdict: z.literal('approved'),
  createdAt: z.string().min(1),
})
export type Advice = z.infer<typeof AdviceSchema>

// Append-only ledger events. `at` is a caller-supplied ISO timestamp string —
// keeping time out of the pure core makes the reducer deterministic and testable.
export const LedgerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.created'), at: z.string().min(1), room: RoomSchema }),
  z.object({ type: z.literal('participant.joined'), at: z.string().min(1), participant: ParticipantSchema }),
  z.object({ type: z.literal('task.created'), at: z.string().min(1), task: TaskSchema }),
  z.object({ type: z.literal('task.status_changed'), at: z.string().min(1), taskId: z.string().min(1), status: TaskStatusSchema }),
  z.object({ type: z.literal('task.assigned'), at: z.string().min(1), taskId: z.string().min(1), implementerId: z.string().min(1) }),
  z.object({ type: z.literal('review.recorded'), at: z.string().min(1), review: ReviewSchema }),
  z.object({ type: z.literal('validation.recorded'), at: z.string().min(1), validation: ValidationSchema }),
  z.object({ type: z.literal('escalation.recorded'), at: z.string().min(1), escalation: EscalationSchema }),
  z.object({ type: z.literal('advice.recorded'), at: z.string().min(1), advice: AdviceSchema }),
  z.object({ type: z.literal('session.started'), at: z.string().min(1), roomId: z.string().min(1), tool: z.enum(['zellij', 'opencode']), sessionName: z.string().min(1) }),
  z.object({ type: z.literal('sandbox.started'), at: z.string().min(1), roomId: z.string().min(1), provider: z.string().min(1), sandboxId: z.string().min(1) }),
  z.object({ type: z.literal('action.recorded'), at: z.string().min(1), roomId: z.string().min(1), taskId: z.string().min(1).optional(), tool: z.string().min(1), summary: z.string().min(1) }),
])
export type LedgerEvent = z.infer<typeof LedgerEventSchema>

// Persistence envelope: every stored event is stamped with the schema version it was
// written under, so a reader can detect and reject (or later migrate) older logs at the
// trust boundary. A version mismatch fails the `schemaVersion` literal on parse.
//
// ponytail: only 0.1.0 exists. Additive event variants (new union members like
// session.started) ride the current version — old ledgers still validate, so no bump.
// A version mismatch is rejected outright; when a genuinely breaking change ships, widen
// `schemaVersion` to a union and route old envelopes through a migration.
export const StoredLedgerEventSchema = z.object({
  schemaVersion: z.literal(SCHEMAS_VERSION),
  event: LedgerEventSchema,
})
export type StoredLedgerEvent = z.infer<typeof StoredLedgerEventSchema>

// Projection of the event log. `room` is always present once the log is non-empty
// (the first event must be room.created — enforced by the room-ledger reducer).
export const RoomStateSchema = z.object({
  room: RoomSchema,
  participants: z.array(ParticipantSchema),
  tasks: z.array(TaskSchema),
  reviews: z.array(ReviewSchema),
  validations: z.array(ValidationSchema),
  escalations: z.array(EscalationSchema),
  advice: z.array(AdviceSchema),
  sessions: z.array(z.object({ tool: z.enum(['zellij', 'opencode']), sessionName: z.string().min(1), at: z.string().min(1) })),
  sandboxes: z.array(z.object({ provider: z.string().min(1), sandboxId: z.string().min(1), at: z.string().min(1) })),
  actions: z.array(z.object({ tool: z.string().min(1), summary: z.string().min(1), taskId: z.string().min(1).optional(), at: z.string().min(1) })),
})
export type RoomState = z.infer<typeof RoomStateSchema>
