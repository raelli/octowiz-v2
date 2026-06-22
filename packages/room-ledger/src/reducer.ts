import type { LedgerEvent, RoomState } from '@octowiz/schemas'

/** Fold a single event onto the running state. The first event must be room.created. */
export function applyEvent(state: RoomState | null, event: LedgerEvent): RoomState {
  if (state === null) {
    if (event.type !== 'room.created')
      throw new Error(`first event must be room.created, got "${event.type}"`)
    return { room: event.room, participants: [], tasks: [], reviews: [], validations: [], escalations: [], advice: [], sessions: [], sandboxes: [] }
  }

  // Enforce domain invariants here so every write path (the RoomLedger preflight) and
  // every read path (folding a persisted log) rejects orphan, duplicate, or mismatched
  // events the same way. In an append-only ledger a silently-accepted bad event becomes
  // permanent history, so fail closed rather than no-op.
  const hasTask = (id: string): boolean => state.tasks.some(t => t.id === id)

  switch (event.type) {
    case 'room.created':
      throw new Error('room.created received but the room already exists')
    case 'participant.joined':
      if (state.participants.some(p => p.id === event.participant.id))
        throw new Error(`duplicate participant id "${event.participant.id}"`)
      return { ...state, participants: [...state.participants, event.participant] }
    case 'task.created':
      if (event.task.roomId !== state.room.id)
        throw new Error(`task "${event.task.id}" roomId "${event.task.roomId}" does not match room "${state.room.id}"`)
      if (hasTask(event.task.id))
        throw new Error(`duplicate task id "${event.task.id}"`)
      return { ...state, tasks: [...state.tasks, event.task] }
    case 'task.assigned':
      if (!hasTask(event.taskId))
        throw new Error(`task.assigned references unknown task "${event.taskId}"`)
      if (!state.participants.some(p => p.id === event.implementerId))
        throw new Error(`task.assigned references unknown participant "${event.implementerId}"`)
      return { ...state, tasks: state.tasks.map(t => t.id === event.taskId ? { ...t, implementerId: event.implementerId } : t) }
    case 'task.status_changed':
      if (!hasTask(event.taskId))
        throw new Error(`task.status_changed references unknown task "${event.taskId}"`)
      return { ...state, tasks: state.tasks.map(t => t.id === event.taskId ? { ...t, status: event.status } : t) }
    case 'review.recorded':
      if (!hasTask(event.review.taskId))
        throw new Error(`review references unknown task "${event.review.taskId}"`)
      if (state.reviews.some(r => r.id === event.review.id))
        throw new Error(`duplicate review id "${event.review.id}"`)
      return { ...state, reviews: [...state.reviews, event.review] }
    case 'validation.recorded':
      if (!hasTask(event.validation.taskId))
        throw new Error(`validation references unknown task "${event.validation.taskId}"`)
      if (state.validations.some(v => v.id === event.validation.id))
        throw new Error(`duplicate validation id "${event.validation.id}"`)
      return { ...state, validations: [...state.validations, event.validation] }
    case 'escalation.recorded':
      if (event.escalation.roomId !== state.room.id)
        throw new Error(`escalation roomId "${event.escalation.roomId}" does not match room "${state.room.id}"`)
      if (event.escalation.taskId !== undefined && !hasTask(event.escalation.taskId))
        throw new Error(`escalation references unknown task "${event.escalation.taskId}"`)
      if (state.escalations.some(e => e.id === event.escalation.id))
        throw new Error(`duplicate escalation id "${event.escalation.id}"`)
      return { ...state, escalations: [...state.escalations, event.escalation] }
    case 'advice.recorded':
      if (event.advice.roomId !== state.room.id)
        throw new Error(`advice roomId \"${event.advice.roomId}\" does not match room \"${state.room.id}\"`)
      if (!hasTask(event.advice.taskId))
        throw new Error(`advice references unknown task \"${event.advice.taskId}\"`)
      if (state.advice.some(a => a.id === event.advice.id))
        throw new Error(`duplicate advice id \"${event.advice.id}\"`)
      return { ...state, advice: [...state.advice, event.advice] }
    case 'session.started':
      if (event.roomId !== state.room.id)
        throw new Error(`session.started roomId "${event.roomId}" does not match room "${state.room.id}"`)
      return { ...state, sessions: [...state.sessions, { tool: event.tool, sessionName: event.sessionName, at: event.at }] }
    case 'sandbox.started':
      if (event.roomId !== state.room.id)
        throw new Error(`sandbox.started roomId "${event.roomId}" does not match room "${state.room.id}"`)
      return { ...state, sandboxes: [...state.sandboxes, { provider: event.provider, sandboxId: event.sandboxId, at: event.at }] }
  }
}

/** Fold an entire event log. Returns null for an empty log (no room yet). */
export function applyEvents(events: LedgerEvent[]): RoomState | null {
  return events.reduce<RoomState | null>((state, event) => applyEvent(state, event), null)
}
