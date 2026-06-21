import type { RoomState } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { generatePullRequestBody } from './index'

/** A minimal room with one implementer, one reviewer, and one in-review task. */
function baseState(): RoomState {
  return {
    room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' },
    participants: [
      { id: 'impl', kind: 'agent', roles: ['implementer'], displayName: 'Impl' },
      { id: 'rev', kind: 'human', roles: ['reviewer'], displayName: 'Rev' },
    ],
    tasks: [{ id: 'tk1', roomId: 'r1', title: 'Do the thing', status: 'in_review', implementerId: 'impl' }],
    reviews: [],
    validations: [],
    escalations: [],
    sessions: [],
    sandboxes: [],
  }
}

/** A fully merge-ready state: passing validation with checks + a qualified approval. */
function readyState(): RoomState {
  const state = baseState()
  state.validations.push({
    id: 'v1',
    taskId: 'tk1',
    status: 'passed',
    checks: [
      { name: 'lint', status: 'passed' },
      { name: 'type-check', status: 'passed' },
      { name: 'test', status: 'passed' },
    ],
    createdAt: 't1',
  })
  state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
  return state
}

describe('generatePullRequestBody', () => {
  it('renders the task title and the three required sections', () => {
    const body = generatePullRequestBody(readyState(), 'tk1')
    expect(body).toContain('Do the thing')
    expect(body).toMatch(/## Validation/i)
    expect(body).toMatch(/## Review/i)
    expect(body).toMatch(/## Merge readiness/i)
  })

  describe('validation summary', () => {
    it('renders each check name with its pass/fail result', () => {
      const body = generatePullRequestBody(readyState(), 'tk1')
      expect(body).toContain('lint')
      expect(body).toContain('type-check')
      expect(body).toContain('test')
      expect(body).toMatch(/lint.*pass/i)
    })

    it('renders failed checks of the latest validation', () => {
      const state = baseState()
      state.validations.push({
        id: 'v1',
        taskId: 'tk1',
        status: 'failed',
        checks: [
          { name: 'lint', status: 'passed' },
          { name: 'test', status: 'failed' },
        ],
        createdAt: 't1',
      })
      const body = generatePullRequestBody(state, 'tk1')
      expect(body).toMatch(/test.*fail/i)
    })

    it('renders the LATEST validation (matching isMergeReady) when several exist', () => {
      const state = baseState()
      state.validations.push({
        id: 'v1',
        taskId: 'tk1',
        status: 'failed',
        checks: [{ name: 'stale-check', status: 'failed' }],
        createdAt: 't1',
      })
      state.validations.push({
        id: 'v2',
        taskId: 'tk1',
        status: 'passed',
        checks: [{ name: 'fresh-check', status: 'passed' }],
        createdAt: 't2',
      })
      const body = generatePullRequestBody(state, 'tk1')
      expect(body).toContain('fresh-check')
      expect(body).not.toContain('stale-check')
    })

    it('states that no validation has run when none exists', () => {
      const body = generatePullRequestBody(baseState(), 'tk1')
      expect(body).toMatch(/no validation/i)
    })
  })

  describe('review summary', () => {
    it('renders each reviewer verdict with who reviewed', () => {
      const body = generatePullRequestBody(readyState(), 'tk1')
      expect(body).toContain('Rev')
      expect(body).toMatch(/approved/i)
    })

    it('renders the latest verdict per reviewer (matching isMergeReady)', () => {
      const state = readyState()
      // Same reviewer later requests changes — the latest verdict wins.
      state.reviews.push({ id: 'rv2', taskId: 'tk1', reviewerId: 'rev', verdict: 'changes_requested', createdAt: 't3' })
      const body = generatePullRequestBody(state, 'tk1')
      expect(body).toMatch(/changes.requested/i)
      // The superseded approval should not be rendered for that reviewer.
      expect(body).not.toMatch(/Rev.*approved/i)
    })

    it('states that nobody has reviewed when no review exists', () => {
      const body = generatePullRequestBody(baseState(), 'tk1')
      expect(body).toMatch(/no review/i)
    })
  })

  describe('merge readiness', () => {
    it('renders ready when isMergeReady is satisfied', () => {
      const body = generatePullRequestBody(readyState(), 'tk1')
      expect(body).toMatch(/ready/i)
      // No unmet-reason lines should appear.
      expect(body).not.toContain('no approving review from a qualified reviewer')
    })

    it('renders not-ready with the single unmet reason', () => {
      const state = readyState()
      // Drop the approval so exactly one reason is unmet.
      state.reviews = []
      const body = generatePullRequestBody(state, 'tk1')
      expect(body).toMatch(/not ready/i)
      expect(body).toContain('no approving review from a qualified reviewer')
    })

    it('renders all unmet reasons when several conditions fail', () => {
      const state = baseState()
      // No validation and no review => two reasons from isMergeReady.
      const body = generatePullRequestBody(state, 'tk1')
      expect(body).toMatch(/not ready/i)
      expect(body).toContain('no validation recorded')
      expect(body).toContain('no approving review from a qualified reviewer')
    })

    it('reflects the merged task reason', () => {
      const state = readyState()
      state.tasks[0]!.status = 'merged'
      const body = generatePullRequestBody(state, 'tk1')
      expect(body).toContain('task already merged')
    })
  })

  describe('edge cases', () => {
    it('does not crash and reports not-found for an unknown task', () => {
      const body = generatePullRequestBody(baseState(), 'nope')
      expect(body).toMatch(/not ready/i)
      expect(body).toContain('task "nope" not found')
    })

    it('is deterministic for identical input', () => {
      const a = generatePullRequestBody(readyState(), 'tk1')
      const b = generatePullRequestBody(readyState(), 'tk1')
      expect(a).toBe(b)
    })
  })
})
