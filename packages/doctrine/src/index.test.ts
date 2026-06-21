import type { RoomState } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { canReview, isMergeReady } from './index'

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
  }
}

describe('canReview', () => {
  it('allows a reviewer who is not the implementer', () => {
    expect(canReview(baseState(), 'tk1', 'rev')).toBe(true)
  })

  it('forbids the implementer reviewing their own task', () => {
    expect(canReview(baseState(), 'tk1', 'impl')).toBe(false)
  })

  it('forbids an unknown participant', () => {
    expect(canReview(baseState(), 'tk1', 'ghost')).toBe(false)
  })
})

describe('isMergeReady', () => {
  it('is not ready with no validation and no review', () => {
    const result = isMergeReady(baseState(), 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('no validation recorded')
    expect(result.reasons).toContain('no approving review from a qualified reviewer')
  })

  it('is not ready when only a self-approval exists', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'impl', verdict: 'approved', createdAt: 't2' })
    expect(isMergeReady(state, 'tk1').ready).toBe(false)
  })

  it('is not ready when the only approval is from a non-participant (ghost reviewer)', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'ghost', verdict: 'approved', createdAt: 't2' })
    const result = isMergeReady(state, 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('no approving review from a qualified reviewer')
  })

  it('is not ready when the approver is a participant without the reviewer role', () => {
    const state = baseState()
    state.participants.push({ id: 'val', kind: 'agent', roles: ['validator'], displayName: 'Val' })
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'val', verdict: 'approved', createdAt: 't2' })
    expect(isMergeReady(state, 'tk1').ready).toBe(false)
  })

  it('is ready with a passing validation and a non-implementer approval', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    expect(isMergeReady(state, 'tk1')).toEqual({ ready: true, reasons: [] })
  })

  it('reports an unknown task', () => {
    expect(isMergeReady(baseState(), 'nope')).toEqual({ ready: false, reasons: ['task "nope" not found'] })
  })

  it('is not ready when the task has no implementer', () => {
    const state = baseState()
    state.tasks = [{ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'in_review' }]
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    const result = isMergeReady(state, 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('task has no implementer')
  })
})
