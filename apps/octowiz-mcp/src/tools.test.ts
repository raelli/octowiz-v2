import { describe, it, expect } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoomLedger, FileLedgerStore } from '@octowiz/room-ledger'
import { roomStatusHandler } from './tools.js'

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
