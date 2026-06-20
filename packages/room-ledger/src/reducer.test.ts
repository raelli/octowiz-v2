import type { LedgerEvent } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { applyEvent, applyEvents } from './reducer'

const room = { id: 'r1', name: 'Room One', status: 'active' as const, createdAt: 't0' }
const created: LedgerEvent = { type: 'room.created', at: 't0', room }

describe('applyEvent', () => {
  it('creates initial state from room.created', () => {
    const state = applyEvent(null, created)
    expect(state.room.id).toBe('r1')
    expect(state.participants).toEqual([])
  })

  it('throws if the first event is not room.created', () => {
    expect(() => applyEvent(null, { type: 'task.status_changed', at: 't1', taskId: 'x', status: 'open' })).toThrow()
  })

  it('folds participant, task, assignment, status, review, validation, escalation', () => {
    const events: LedgerEvent[] = [
      created,
      { type: 'participant.joined', at: 't1', participant: { id: 'p1', kind: 'agent', roles: ['implementer'], displayName: 'Impl' } },
      { type: 'task.created', at: 't2', task: { id: 'tk1', roomId: 'r1', title: 'Do it', status: 'open' } },
      { type: 'task.assigned', at: 't3', taskId: 'tk1', implementerId: 'p1' },
      { type: 'task.status_changed', at: 't4', taskId: 'tk1', status: 'in_review' },
      { type: 'review.recorded', at: 't5', review: { id: 'rv1', taskId: 'tk1', reviewerId: 'p2', verdict: 'approved', createdAt: 't5' } },
      { type: 'validation.recorded', at: 't6', validation: { id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't6' } },
      { type: 'escalation.recorded', at: 't7', escalation: { id: 'e1', roomId: 'r1', reason: 'stuck', createdAt: 't7' } },
    ]
    const state = applyEvents(events)!
    expect(state.participants).toHaveLength(1)
    expect(state.tasks[0]).toMatchObject({ implementerId: 'p1', status: 'in_review' })
    expect(state.reviews).toHaveLength(1)
    expect(state.validations).toHaveLength(1)
    expect(state.escalations).toHaveLength(1)
  })

  it('returns null for an empty event log', () => {
    expect(applyEvents([])).toBeNull()
  })
})

describe('applyEvent invariants', () => {
  const join = (...rest: LedgerEvent[]): LedgerEvent[] => [created, ...rest]

  it('rejects a duplicate room.created', () => {
    expect(() => applyEvents([created, created])).toThrow()
  })

  it('rejects a task whose roomId does not match the room', () => {
    expect(() => applyEvents(join(
      { type: 'task.created', at: 't1', task: { id: 'tk1', roomId: 'other', title: 'X', status: 'open' } },
    ))).toThrow()
  })

  it('rejects a duplicate task id', () => {
    const task: LedgerEvent = { type: 'task.created', at: 't1', task: { id: 'tk1', roomId: 'r1', title: 'X', status: 'open' } }
    expect(() => applyEvents(join(task, { ...task, at: 't2' }))).toThrow()
  })

  it('rejects a duplicate participant id', () => {
    const p: LedgerEvent = { type: 'participant.joined', at: 't1', participant: { id: 'p1', kind: 'agent', roles: [], displayName: 'P' } }
    expect(() => applyEvents(join(p, { ...p, at: 't2' }))).toThrow()
  })

  it('rejects assigning an unknown task', () => {
    expect(() => applyEvents(join(
      { type: 'participant.joined', at: 't1', participant: { id: 'p1', kind: 'agent', roles: ['implementer'], displayName: 'P' } },
      { type: 'task.assigned', at: 't2', taskId: 'ghost', implementerId: 'p1' },
    ))).toThrow()
  })

  it('rejects assigning to a non-participant implementer', () => {
    expect(() => applyEvents(join(
      { type: 'task.created', at: 't1', task: { id: 'tk1', roomId: 'r1', title: 'X', status: 'open' } },
      { type: 'task.assigned', at: 't2', taskId: 'tk1', implementerId: 'ghost' },
    ))).toThrow()
  })

  it('rejects a status change for an unknown task', () => {
    expect(() => applyEvents(join(
      { type: 'task.status_changed', at: 't1', taskId: 'ghost', status: 'open' },
    ))).toThrow()
  })

  it('rejects a review for an unknown task', () => {
    expect(() => applyEvents(join(
      { type: 'review.recorded', at: 't1', review: { id: 'rv1', taskId: 'ghost', reviewerId: 'p2', verdict: 'approved', createdAt: 't1' } },
    ))).toThrow()
  })

  it('rejects a validation for an unknown task', () => {
    expect(() => applyEvents(join(
      { type: 'validation.recorded', at: 't1', validation: { id: 'v1', taskId: 'ghost', status: 'passed', checks: [], createdAt: 't1' } },
    ))).toThrow()
  })

  it('rejects an escalation referencing an unknown task', () => {
    expect(() => applyEvents(join(
      { type: 'escalation.recorded', at: 't1', escalation: { id: 'e1', roomId: 'r1', taskId: 'ghost', reason: 'x', createdAt: 't1' } },
    ))).toThrow()
  })
})
