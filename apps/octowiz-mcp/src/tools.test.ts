import { describe, it, expect } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoomLedger, FileLedgerStore } from '@octowiz/room-ledger'
import { roomStatusHandler, recordHandler } from './tools.js'

async function fixtureCtx() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-tools-'))
  const ledger = new RoomLedger(new FileLedgerStore(join(root, '.octowiz', 'ledger')))
  const at = '2026-06-25T00:00:00.000Z'
  await ledger.createRoom({ id: 'r1', name: 'demo', status: 'active', createdAt: at }, at)
  return { ledger, roomId: 'r1' }
}

describe('octowiz_room_status', () => {
  it('returns the current room state as JSON text', async () => {
    const ctx = await fixtureCtx()
    const r = await roomStatusHandler(async () => ctx)
    expect(r.isError).toBeFalsy()
    const state = JSON.parse(r.content[0]!.text)
    expect(state.room.id).toBe('r1')
    expect(state.room.name).toBe('demo')
  })
})

describe('octowiz_record', () => {
  it('records a task_created event', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:01:00.000Z'
    const r = await recordHandler(async () => ctx, now, {
      kind: 'task_created', title: 'wire mcp', description: 'expose tools',
    })
    expect(r.isError).toBeFalsy()
    const state = await ctx.ledger.getState('r1')
    expect(state?.tasks.at(-1)?.title).toBe('wire mcp')
  })

  it('records an action milestone tied to a task', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:02:00.000Z'
    await recordHandler(async () => ctx, now, { kind: 'task_created', title: 't' })
    const state0 = await ctx.ledger.getState('r1')
    const taskId = state0!.tasks.at(-1)!.id
    const r = await recordHandler(async () => ctx, now, {
      kind: 'action', tool: 'opencode', summary: 'edited server.ts', taskId,
    })
    expect(r.isError).toBeFalsy()
    const state = await ctx.ledger.getState('r1')
    expect(state?.actions.at(-1)?.summary).toBe('edited server.ts')
  })
})
