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
import { applyEvents } from './reducer'

/** Typed facade over a LedgerStore: build → append → project. Callers supply `at`. */
export class RoomLedger {
  constructor(private readonly store: LedgerStore) {}

  async getState(roomId: string): Promise<RoomState | null> {
    return applyEvents(await this.store.readEvents(roomId))
  }

  private async appendAndProject(roomId: string, event: LedgerEvent): Promise<RoomState> {
    // Validate before persisting: replay the existing log plus the candidate in memory.
    // applyEvents throws on any invariant violation, so a bad event is rejected *before*
    // it is appended — otherwise it would become permanent, unreadable history.
    const events = await this.store.readEvents(roomId)
    const projected = applyEvents([...events, event])
    if (projected === null)
      throw new Error(`room "${roomId}" has no state after applying ${event.type}`)

    // ponytail: single-writer assumption — the read-validate-append window is not atomic
    // across concurrent writers or processes. Add a per-room file lock / compare-and-swap
    // if Octowiz ever writes a room's log from more than one place at once.
    await this.store.appendEvent(roomId, event)
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
}
