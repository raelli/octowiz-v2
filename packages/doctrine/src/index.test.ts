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
    expect(result.reasons).toContain('no approving review from a non-implementer')
  })

  it('is not ready when only a self-approval exists', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'impl', verdict: 'approved', createdAt: 't2' })
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
})
