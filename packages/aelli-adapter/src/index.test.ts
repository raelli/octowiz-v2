import type { RoomState } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { buildEscalationRequest, shouldEscalate } from './index'

function baseState(): RoomState {
  return {
    room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' },
    participants: [
      { id: 'impl', kind: 'agent', roles: ['implementer'], displayName: 'Impl' },
      { id: 'rev', kind: 'agent', roles: ['reviewer'], displayName: 'Rev' },
    ],
    tasks: [{ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'in_review', implementerId: 'impl' }],
    reviews: [],
    validations: [],
    escalations: [],
    sessions: [],
    sandboxes: [],
  }
}

describe('shouldEscalate', () => {
  it('does not escalate a healthy in-review task with no signals', () => {
    expect(shouldEscalate(baseState(), 'tk1')).toEqual({ escalate: false })
  })

  it('does not escalate (and gives no reason) for an unknown task', () => {
    expect(shouldEscalate(baseState(), 'nope')).toEqual({ escalate: false })
  })

  it('escalates when the latest validation failed', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'failed', checks: [], createdAt: 't1' })
    const result = shouldEscalate(state, 'tk1')
    expect(result.escalate).toBe(true)
    expect(result.reason).toContain('validation')
  })

  it('does not escalate when the latest validation passed', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    expect(shouldEscalate(state, 'tk1')).toEqual({ escalate: false })
  })

  // Mirrors doctrine: "latest" follows ledger APPEND order, not createdAt. A later-appended
  // failed validation escalates even though it carries an older createdAt than an earlier
  // passing one.
  it('uses ledger append order, not createdAt, for the latest validation', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: '2026-01-02T00:00:00Z' })
    state.validations.push({ id: 'v2', taskId: 'tk1', status: 'failed', checks: [], createdAt: '2026-01-01T00:00:00Z' })
    expect(shouldEscalate(state, 'tk1').escalate).toBe(true)
  })

  it('does not escalate when a later-appended validation passes after an earlier failure', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'failed', checks: [], createdAt: 't1' })
    state.validations.push({ id: 'v2', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't2' })
    expect(shouldEscalate(state, 'tk1')).toEqual({ escalate: false })
  })

  it('escalates when the latest review from a reviewer is a rejection', () => {
    const state = baseState()
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'rejected', createdAt: 't1' })
    const result = shouldEscalate(state, 'tk1')
    expect(result.escalate).toBe(true)
    expect(result.reason).toContain('review')
  })

  it('does not escalate on changes_requested (the normal review loop, not an escalation)', () => {
    const state = baseState()
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'changes_requested', createdAt: 't1' })
    expect(shouldEscalate(state, 'tk1')).toEqual({ escalate: false })
  })

  it('does not escalate when a rejection was later superseded by an approval (append order)', () => {
    const state = baseState()
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'rejected', createdAt: 't1' })
    state.reviews.push({ id: 'rv2', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    expect(shouldEscalate(state, 'tk1')).toEqual({ escalate: false })
  })

  it('escalates when a blocked task has a standing rejection from another reviewer (append order, per-reviewer)', () => {
    const state = baseState()
    state.participants.push({ id: 'rev2', kind: 'agent', roles: ['reviewer'], displayName: 'Rev2' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'rejected', createdAt: 't1' })
    state.reviews.push({ id: 'rv2', taskId: 'tk1', reviewerId: 'rev2', verdict: 'approved', createdAt: 't2' })
    // rev's latest verdict is still a rejection; rev2 approving does not clear it.
    expect(shouldEscalate(state, 'tk1').escalate).toBe(true)
  })

  it('escalates when the task is blocked', () => {
    const state = baseState()
    state.tasks = [{ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'blocked', implementerId: 'impl' }]
    const result = shouldEscalate(state, 'tk1')
    expect(result.escalate).toBe(true)
    expect(result.reason).toContain('blocked')
  })

  it('ignores reviews and validations belonging to other tasks', () => {
    const state = baseState()
    state.tasks.push({ id: 'tk2', roomId: 'r1', title: 'Other', status: 'in_review', implementerId: 'impl' })
    state.validations.push({ id: 'v1', taskId: 'tk2', status: 'failed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk2', reviewerId: 'rev', verdict: 'rejected', createdAt: 't2' })
    expect(shouldEscalate(state, 'tk1')).toEqual({ escalate: false })
  })
})

describe('buildEscalationRequest', () => {
  it('builds a self-contained payload scoped to the task', () => {
    const state = baseState()
    state.tasks.push({ id: 'tk2', roomId: 'r1', title: 'Other', status: 'open', implementerId: 'impl' })
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'failed', checks: [{ name: 'lint', status: 'failed' }], createdAt: 't1' })
    state.validations.push({ id: 'v2', taskId: 'tk2', status: 'passed', checks: [], createdAt: 't2' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'rejected', createdAt: 't3' })
    state.reviews.push({ id: 'rv2', taskId: 'tk2', reviewerId: 'rev', verdict: 'approved', createdAt: 't4' })

    const payload = buildEscalationRequest(state, 'tk1')

    expect(payload.room).toEqual(state.room)
    expect(payload.task).toEqual(state.tasks[0])
    // Only this task's reviews and validations are included.
    expect(payload.reviews).toEqual([state.reviews[0]])
    expect(payload.validations).toEqual([state.validations[0]])
    // The escalation reason is carried alongside the context.
    expect(payload.reason).toContain('validation')
  })

  it('builds a payload even when no trigger fires (reason is undefined)', () => {
    const payload = buildEscalationRequest(baseState(), 'tk1')
    expect(payload.reason).toBeUndefined()
    expect(payload.reviews).toEqual([])
    expect(payload.validations).toEqual([])
  })

  it('throws for an unknown task (building a payload for a nonexistent task is a caller bug)', () => {
    expect(() => buildEscalationRequest(baseState(), 'nope')).toThrow(/nope/)
  })
})
