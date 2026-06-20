import type { LedgerEvent, RoomState } from '@octowiz/schemas'

/** Fold a single event onto the running state. The first event must be room.created. */
export function applyEvent(state: RoomState | null, event: LedgerEvent): RoomState {
  if (state === null) {
    if (event.type !== 'room.created')
      throw new Error(`first event must be room.created, got "${event.type}"`)
    return { room: event.room, participants: [], tasks: [], reviews: [], validations: [], escalations: [] }
  }

  switch (event.type) {
    case 'room.created':
      throw new Error('room.created received but the room already exists')
    case 'participant.joined':
      return { ...state, participants: [...state.participants, event.participant] }
    case 'task.created':
      return { ...state, tasks: [...state.tasks, event.task] }
    case 'task.assigned':
      return { ...state, tasks: state.tasks.map(t => t.id === event.taskId ? { ...t, implementerId: event.implementerId } : t) }
    case 'task.status_changed':
      return { ...state, tasks: state.tasks.map(t => t.id === event.taskId ? { ...t, status: event.status } : t) }
    case 'review.recorded':
      return { ...state, reviews: [...state.reviews, event.review] }
    case 'validation.recorded':
      return { ...state, validations: [...state.validations, event.validation] }
    case 'escalation.recorded':
      return { ...state, escalations: [...state.escalations, event.escalation] }
  }
}

/** Fold an entire event log. Returns null for an empty log (no room yet). */
export function applyEvents(events: LedgerEvent[]): RoomState | null {
  return events.reduce<RoomState | null>((state, event) => applyEvent(state, event), null)
}
