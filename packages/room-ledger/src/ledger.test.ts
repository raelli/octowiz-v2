import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RoomLedger } from './ledger'
import { FileLedgerStore } from './store'

async function freshLedger(): Promise<RoomLedger> {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-ledger-fac-'))
  return new RoomLedger(new FileLedgerStore(root))
}

describe('roomLedger preflight', () => {
  it('rejects a second createRoom without corrupting the log', async () => {
    const ledger = await freshLedger()
    const room = { id: 'r1', name: 'Room', status: 'active' as const, createdAt: 't0' }
    await ledger.createRoom(room, 't0')
    await expect(ledger.createRoom(room, 't1')).rejects.toThrow()
    // The rejected event must NOT have been persisted: the log still loads.
    const state = await ledger.getState('r1')
    expect(state).not.toBeNull()
    expect(state!.room.id).toBe('r1')
  })

  it('rejects an invariant-violating mutation without persisting it', async () => {
    const ledger = await freshLedger()
    await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: 't0' }, 't0')
    await expect(ledger.setTaskStatus('r1', 'ghost', 'open', 't1')).rejects.toThrow()
    const state = await ledger.getState('r1')
    expect(state!.tasks).toEqual([])
  })

  it('records a session start', async () => {
    const ledger = await freshLedger()
    await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: 't0' }, 't0')
    const state = await ledger.recordSessionStart('r1', 'zellij', 'octowiz-r1', 't1')
    expect(state.sessions).toEqual([{ tool: 'zellij', sessionName: 'octowiz-r1', at: 't1' }])
  })

  it('records an action and projects it into room state', async () => {
    const ledger = await freshLedger()
    await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: 't0' }, 't0')
    await ledger.createTask({ id: 'tk1', roomId: 'r1', title: 'X', status: 'open' }, 't1')
    const state = await ledger.recordAction('r1', 'bash', 'pnpm test', 't2', 'tk1')
    expect(state.actions).toEqual([{ tool: 'bash', summary: 'pnpm test', taskId: 'tk1', at: 't2' }])
  })

  it('records an action without a taskId', async () => {
    const ledger = await freshLedger()
    await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: 't0' }, 't0')
    const state = await ledger.recordAction('r1', 'bash', 'pnpm test', 't1')
    expect(state.actions).toEqual([{ tool: 'bash', summary: 'pnpm test', taskId: undefined, at: 't1' }])
  })

  it('rejects recordAction for an unknown room', async () => {
    const ledger = await freshLedger()
    await expect(ledger.recordAction('ghost', 'bash', 'pnpm test', 't1')).rejects.toThrow()
  })

  it('recordAdvice projects approved advice into room state', async () => {
    const at = '2026-06-22T00:00:00.000Z'
    const ledger = await freshLedger()
    await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: at }, at)
    await ledger.createTask({ id: 't1', roomId: 'r1', title: 'Task', status: 'open' }, at)
    const state = await ledger.recordAdvice('r1', {
      id: 'adv1',
      roomId: 'r1',
      taskId: 't1',
      advisorId: 'adv',
      reviewerId: 'rev',
      tier: 'cheap-model',
      recommendation: 'do X',
      verdict: 'approved',
      createdAt: at,
    }, at)
    expect(state.advice).toHaveLength(1)
    expect(state.advice[0]?.tier).toBe('cheap-model')
  })
})
