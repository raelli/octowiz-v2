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

  it('is not ready when the task is already merged', () => {
    const state = baseState()
    state.tasks = [{ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'merged', implementerId: 'impl' }]
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    const result = isMergeReady(state, 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('task already merged')
  })

  it('is not ready when the task is blocked', () => {
    const state = baseState()
    state.tasks = [{ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'blocked', implementerId: 'impl' }]
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    const result = isMergeReady(state, 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('task is blocked')
  })

  it('is not ready when a reviewer approves then later requests changes', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    state.reviews.push({ id: 'rv2', taskId: 'tk1', reviewerId: 'rev', verdict: 'changes_requested', createdAt: 't3' })
    const result = isMergeReady(state, 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('no approving review from a qualified reviewer')
  })

  it('is ready when a reviewer requests changes then later approves', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'changes_requested', createdAt: 't2' })
    state.reviews.push({ id: 'rv2', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't3' })
    expect(isMergeReady(state, 'tk1')).toEqual({ ready: true, reasons: [] })
  })

  it('is ready when one of two reviewers has a latest verdict of approved', () => {
    const state = baseState()
    state.participants.push({ id: 'rev2', kind: 'agent', roles: ['reviewer'], displayName: 'Rev2' })
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    // rev's latest verdict is changes_requested; rev2's latest is approved.
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    state.reviews.push({ id: 'rv2', taskId: 'tk1', reviewerId: 'rev', verdict: 'changes_requested', createdAt: 't3' })
    state.reviews.push({ id: 'rv3', taskId: 'tk1', reviewerId: 'rev2', verdict: 'approved', createdAt: 't4' })
    expect(isMergeReady(state, 'tk1')).toEqual({ ready: true, reasons: [] })
  })

  it('is not ready when no reviewer has a latest approval (multi-reviewer, stale approval superseded)', () => {
    const state = baseState()
    state.participants.push({ id: 'rev2', kind: 'agent', roles: ['reviewer'], displayName: 'Rev2' })
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    // rev approved then superseded it with changes_requested; rev2 only ever requested
    // changes. The buggy implementation counted rev's stale approval and wrongly reported
    // ready — this case diverges from that old behavior, which the single-reviewer cases
    // above do not exercise.
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    state.reviews.push({ id: 'rv2', taskId: 'tk1', reviewerId: 'rev', verdict: 'changes_requested', createdAt: 't3' })
    state.reviews.push({ id: 'rv3', taskId: 'tk1', reviewerId: 'rev2', verdict: 'changes_requested', createdAt: 't4' })
    const result = isMergeReady(state, 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('no approving review from a qualified reviewer')
  })

  it('is not ready when a qualified reviewer\'s only verdict is a rejection', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'rejected', createdAt: 't2' })
    const result = isMergeReady(state, 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('no approving review from a qualified reviewer')
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
