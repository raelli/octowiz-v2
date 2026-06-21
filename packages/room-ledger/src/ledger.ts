import type {
  Escalation,
  LedgerEvent,
  Participant,
  Review,
  Room,
  RoomState,
  Task,
  TaskStatus,
  Validation,
} from '@octowiz/schemas'
import type { LedgerStore } from './store'
import { LedgerEventSchema } from '@octowiz/schemas'
import { applyEvents } from './reducer'

/** Typed facade over a LedgerStore: build → append → project. Callers supply `at`. */
export class RoomLedger {
  constructor(private readonly store: LedgerStore) {}

  async getState(roomId: string): Promise<RoomState | null> {
    return applyEvents(await this.store.readEvents(roomId))
  }

  private async appendAndProject(roomId: string, event: LedgerEvent): Promise<RoomState> {
    // Validate before persisting. First parse the candidate structurally, then replay the
    // existing log plus the candidate in memory: applyEvents throws on any invariant
    // violation, so a bad event is rejected *before* it is appended — otherwise it would
    // become permanent, unreadable history. Persist the parsed value, not the raw input.
    const parsed = LedgerEventSchema.parse(event)
    const events = await this.store.readEvents(roomId)
    const projected = applyEvents([...events, parsed])
    if (projected === null)
      throw new Error(`room "${roomId}" has no state after applying ${parsed.type}`)

    // ponytail: PRECONDITION — single writer per room. The read-validate-append window is
    // not atomic across concurrent RoomLedger instances or processes, so two writers can
    // both validate against the same log and append conflicting events (e.g. duplicate
    // ids), corrupting the replay. A per-instance lock would not help the multiplayer
    // topology (separate instances/processes). The real fix is a transactional backend:
    // swap FileLedgerStore for the SQLite LedgerStore when concurrent writers are needed.
    await this.store.appendEvent(roomId, parsed)
    return projected
  }

  createRoom(room: Room, at: string): Promise<RoomState> {
    return this.appendAndProject(room.id, { type: 'room.created', at, room })
  }

  addParticipant(roomId: string, participant: Participant, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'participant.joined', at, participant })
  }

  createTask(task: Task, at: string): Promise<RoomState> {
    return this.appendAndProject(task.roomId, { type: 'task.created', at, task })
  }

  assignTask(roomId: string, taskId: string, implementerId: string, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'task.assigned', at, taskId, implementerId })
  }

  setTaskStatus(roomId: string, taskId: string, status: TaskStatus, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'task.status_changed', at, taskId, status })
  }

  recordReview(roomId: string, review: Review, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'review.recorded', at, review })
  }

  recordValidation(roomId: string, validation: Validation, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'validation.recorded', at, validation })
  }

  recordEscalation(roomId: string, escalation: Escalation, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'escalation.recorded', at, escalation })
  }

  recordSessionStart(roomId: string, tool: 'zellij' | 'opencode', sessionName: string, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'session.started', at, roomId, tool, sessionName })
  }
}
