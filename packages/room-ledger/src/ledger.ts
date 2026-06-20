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
    await this.store.appendEvent(roomId, event)
    const state = await this.getState(roomId)
    if (state === null)
      throw new Error(`room "${roomId}" has no state after appending ${event.type}`)
    return state
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
