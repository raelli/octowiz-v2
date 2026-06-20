import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isMergeReady } from '@octowiz/doctrine'
import { describe, expect, it } from 'vitest'
import { RoomLedger } from './ledger'
import { FileLedgerStore } from './store'

describe('tracer bullet: create → persist → reload → evaluate', () => {
  it('reaches merge-readiness only with a passing validation and an independent approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octowiz-tracer-'))
    const ledger = new RoomLedger(new FileLedgerStore(root))

    await ledger.createRoom({ id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' }, 't0')
    await ledger.addParticipant('r1', { id: 'impl', kind: 'agent', roles: ['implementer'], displayName: 'Impl' }, 't1')
    await ledger.addParticipant('r1', { id: 'rev', kind: 'agent', roles: ['reviewer'], displayName: 'Rev' }, 't2')
    await ledger.createTask({ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'open' }, 't3')
    await ledger.assignTask('r1', 'tk1', 'impl', 't4')
    await ledger.setTaskStatus('r1', 'tk1', 'in_review', 't5')
    await ledger.recordValidation('r1', { id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't6' }, 't6')
    await ledger.recordReview('r1', { id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't7' }, 't7')

    // Reload purely from disk — a fresh ledger over the same root.
    const reloaded = new RoomLedger(new FileLedgerStore(root))
    const state = await reloaded.getState('r1')
    expect(state).not.toBeNull()
    expect(isMergeReady(state!, 'tk1')).toEqual({ ready: true, reasons: [] })

    // A later failing validation supersedes the earlier pass and must block merge.
    await reloaded.recordValidation('r1', { id: 'v2', taskId: 'tk1', status: 'failed', checks: [{ name: 'test', status: 'failed' }], createdAt: 't8' }, 't8')
    const after = await reloaded.getState('r1')
    const verdict = isMergeReady(after!, 'tk1')
    expect(verdict.ready).toBe(false)
    expect(verdict.reasons).toContain('latest validation did not pass')
  })
})
