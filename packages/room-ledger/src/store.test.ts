import type { LedgerEvent } from '@octowiz/schemas'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileLedgerStore } from './store'

const created: LedgerEvent = {
  type: 'room.created',
  at: 't0',
  room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' },
}

async function tmpRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'octowiz-ledger-'))
}

describe('fileLedgerStore', () => {
  it('returns [] for a room with no events', async () => {
    const store = new FileLedgerStore(await tmpRoot())
    expect(await store.readEvents('missing')).toEqual([])
  })

  it('round-trips appended events', async () => {
    const store = new FileLedgerStore(await tmpRoot())
    await store.appendEvent('r1', created)
    await store.appendEvent('r1', { type: 'task.created', at: 't1', task: { id: 'tk1', roomId: 'r1', title: 'Do it', status: 'open' } })
    const events = await store.readEvents('r1')
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'room.created' })
    expect(await store.listRooms()).toContain('r1')
  })

  it('throws when a stored line is corrupt', async () => {
    const root = await tmpRoot()
    const store = new FileLedgerStore(root)
    await store.appendEvent('r1', created)
    await writeFile(join(root, 'r1', 'events.jsonl'), '{"type":"nonsense"}\n', 'utf8')
    await expect(store.readEvents('r1')).rejects.toThrow()
  })
})
