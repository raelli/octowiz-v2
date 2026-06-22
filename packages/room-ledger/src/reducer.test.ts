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

  it('initializes sessions to empty on room.created', () => {
    expect(applyEvent(null, created).sessions).toEqual([])
  })

  it('appends a session on session.started', () => {
    const state = applyEvents([
      created,
      { type: 'session.started', at: 't1', roomId: 'r1', tool: 'zellij', sessionName: 'octowiz-r1' },
    ])!
    expect(state.sessions).toEqual([{ tool: 'zellij', sessionName: 'octowiz-r1', at: 't1' }])
  })

  it('initializes sandboxes to empty on room.created', () => {
    expect(applyEvent(null, created).sandboxes).toEqual([])
  })

  it('appends a sandbox on sandbox.started', () => {
    const state = applyEvents([
      created,
      { type: 'sandbox.started', at: 't1', roomId: 'r1', provider: 'podman', sandboxId: 'abc123' },
    ])!
    expect(state.sandboxes).toEqual([{ provider: 'podman', sandboxId: 'abc123', at: 't1' }])
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

  it('rejects a session.started whose roomId does not match the room', () => {
    expect(() => applyEvents(join(
      { type: 'session.started', at: 't1', roomId: 'other', tool: 'zellij', sessionName: 'octowiz-other' },
    ))).toThrow()
  })

  it('rejects a sandbox.started whose roomId does not match the room', () => {
    expect(() => applyEvents(join(
      { type: 'sandbox.started', at: 't1', roomId: 'other', provider: 'podman', sandboxId: 'abc123' },
    ))).toThrow()
  })

  const withTask: LedgerEvent[] = [
    created,
    { type: 'task.created', at: 't1', task: { id: 'tk1', roomId: 'r1', title: 'X', status: 'open' } },
  ]

  it('rejects a duplicate review id', () => {
    const review: LedgerEvent = { type: 'review.recorded', at: 't2', review: { id: 'rv1', taskId: 'tk1', reviewerId: 'p2', verdict: 'approved', createdAt: 't2' } }
    expect(() => applyEvents([...withTask, review, { ...review, at: 't3' }])).toThrow()
  })

  it('rejects a duplicate validation id', () => {
    const validation: LedgerEvent = { type: 'validation.recorded', at: 't2', validation: { id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't2' } }
    expect(() => applyEvents([...withTask, validation, { ...validation, at: 't3' }])).toThrow()
  })

  it('rejects a duplicate escalation id', () => {
    const escalation: LedgerEvent = { type: 'escalation.recorded', at: 't2', escalation: { id: 'e1', roomId: 'r1', reason: 'x', createdAt: 't2' } }
    expect(() => applyEvents([...withTask, escalation, { ...escalation, at: 't3' }])).toThrow()
  })
})

describe('advice.recorded', () => {
  const at = '2026-06-22T00:00:00.000Z'
  const room = { id: 'r1', name: 'Room', status: 'active' as const, createdAt: at }
  const task = { id: 't1', roomId: 'r1', title: 'Task', status: 'open' as const }
  const advice = {
    id: 'adv1',
    roomId: 'r1',
    taskId: 't1',
    advisorId: 'adv',
    reviewerId: 'rev',
    tier: 'cheap-model',
    recommendation: 'do X',
    verdict: 'approved' as const,
    createdAt: at,
  }

  it('appends advice for a known task', () => {
    const state = applyEvents([
      { type: 'room.created', at, room },
      { type: 'task.created', at, task },
      { type: 'advice.recorded', at, advice },
    ])
    expect(state?.advice).toEqual([advice])
  })

  it('rejects advice for an unknown task', () => {
    expect(() => applyEvents([
      { type: 'room.created', at, room },
      { type: 'advice.recorded', at, advice },
    ])).toThrow(/unknown task/)
  })

  it('rejects a duplicate advice id', () => {
    expect(() => applyEvents([
      { type: 'room.created', at, room },
      { type: 'task.created', at, task },
      { type: 'advice.recorded', at, advice },
      { type: 'advice.recorded', at, advice },
    ])).toThrow(/duplicate advice id/)
  })

  it('rejects advice whose roomId does not match the room', () => {
    expect(() => applyEvents([
      { type: 'room.created', at, room },
      { type: 'task.created', at, task },
      { type: 'advice.recorded', at, advice: { ...advice, roomId: 'other' } },
    ])).toThrow(/does not match room/)
  })
})
