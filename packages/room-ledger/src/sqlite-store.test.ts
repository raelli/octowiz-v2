import type { LedgerEvent } from '@octowiz/schemas'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SCHEMAS_VERSION } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { RoomLedger } from './ledger'
import { ConcurrentWriteError, SqliteLedgerStore } from './sqlite-store'

const created: LedgerEvent = {
  type: 'room.created',
  at: 't0',
  room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' },
}

async function tmpDb(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'octowiz-sqlite-')), 'ledger.db')
}

describe('sqliteLedgerStore', () => {
  it('returns [] for a room with no events', async () => {
    const store = new SqliteLedgerStore(await tmpDb())
    expect(await store.readEvents('missing')).toEqual([])
  })

  it('round-trips appended events in order and lists rooms', async () => {
    const store = new SqliteLedgerStore(await tmpDb())
    await store.appendEvent('r1', created)
    await store.appendEvent('r1', { type: 'task.created', at: 't1', task: { id: 'tk1', roomId: 'r1', title: 'Do it', status: 'open' } })
    const events = await store.readEvents('r1')
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'room.created' })
    expect(events[1]).toMatchObject({ type: 'task.created' })
    expect(await store.listRooms()).toContain('r1')
  })

  it('rejects empty and whitespace-only room ids', async () => {
    const store = new SqliteLedgerStore(await tmpDb())
    await expect(store.appendEvent('', created)).rejects.toThrow()
    await expect(store.appendEvent('   ', created)).rejects.toThrow()
    await expect(store.readEvents('')).rejects.toThrow()
  })

  it('rejects a structurally invalid event before writing anything', async () => {
    const store = new SqliteLedgerStore(await tmpDb())
    const malformed = { type: 'room.created', at: 't0' } as unknown as LedgerEvent
    await expect(store.appendEvent('r1', malformed)).rejects.toThrow()
    expect(await store.readEvents('r1')).toEqual([])
  })

  it('stamps the schema version into persisted events and rejects unsupported versions', async () => {
    const dbPath = await tmpDb()
    const store = new SqliteLedgerStore(dbPath)
    await store.appendEvent('r1', created)

    // The db file is a trust boundary like the jsonl files — inspect and tamper directly.
    const raw = new DatabaseSync(dbPath)
    const row = raw.prepare('SELECT data FROM events WHERE room_id = ?').get('r1') as { data: string }
    expect(JSON.parse(row.data).schemaVersion).toBe(SCHEMAS_VERSION)

    raw.prepare('INSERT INTO events (room_id, data) VALUES (?, ?)')
      .run('r2', JSON.stringify({ schemaVersion: '0.0.1', event: created }))
    raw.close()
    await expect(store.readEvents('r2')).rejects.toThrow()
  })

  it('throws when a stored row is corrupt', async () => {
    const dbPath = await tmpDb()
    const store = new SqliteLedgerStore(dbPath)
    const raw = new DatabaseSync(dbPath)
    raw.prepare('INSERT INTO events (room_id, data) VALUES (?, ?)').run('r1', '{"type":"nonsense"}')
    raw.close()
    await expect(store.readEvents('r1')).rejects.toThrow()
  })

  it('rejects an append whose expectedCount is stale, persisting nothing', async () => {
    const store = new SqliteLedgerStore(await tmpDb())
    await store.appendEvent('r1', created)
    const next: LedgerEvent = { type: 'task.created', at: 't1', task: { id: 'tk1', roomId: 'r1', title: 'X', status: 'open' } }
    await expect(store.appendEvent('r1', next, 0)).rejects.toThrow(ConcurrentWriteError)
    expect(await store.readEvents('r1')).toHaveLength(1)
    // Correct count succeeds.
    await store.appendEvent('r1', next, 1)
    expect(await store.readEvents('r1')).toHaveLength(2)
  })

  it('detects a concurrent writer through a second connection to the same db', async () => {
    const dbPath = await tmpDb()
    const a = new SqliteLedgerStore(dbPath)
    const b = new SqliteLedgerStore(dbPath)
    await a.appendEvent('r1', created)

    // Both writers observe 1 event; b commits first, so a's append must fail.
    const evB: LedgerEvent = { type: 'task.created', at: 't1', task: { id: 'tk-b', roomId: 'r1', title: 'B', status: 'open' } }
    const evA: LedgerEvent = { type: 'task.created', at: 't1', task: { id: 'tk-a', roomId: 'r1', title: 'A', status: 'open' } }
    await b.appendEvent('r1', evB, 1)
    await expect(a.appendEvent('r1', evA, 1)).rejects.toThrow(ConcurrentWriteError)

    const events = await a.readEvents('r1')
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({ task: { id: 'tk-b' } })
  })
})

describe('roomLedger on sqlite — concurrent writers cannot corrupt the log', () => {
  it('the losing writer of a race gets a conflict instead of appending', async () => {
    const dbPath = await tmpDb()
    const ledgerA = new RoomLedger(new SqliteLedgerStore(dbPath))
    const ledgerB = new RoomLedger(new SqliteLedgerStore(dbPath))
    const room = { id: 'r1', name: 'Room', status: 'active' as const, createdAt: 't0' }

    await ledgerA.createRoom(room, 't0')
    // Both instances race the same read-validate-append window: the duplicate
    // createRoom that FileLedgerStore would silently interleave must lose here.
    await expect(ledgerB.createRoom(room, 't1')).rejects.toThrow()

    const results = await Promise.allSettled([
      ledgerA.createTask({ id: 'tk1', roomId: 'r1', title: 'A', status: 'open' }, 't2'),
      ledgerB.createTask({ id: 'tk2', roomId: 'r1', title: 'B', status: 'open' }, 't2'),
    ])
    const fulfilled = results.filter(r => r.status === 'fulfilled')
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)
    // Whatever the interleaving, the log must still replay cleanly.
    const state = await ledgerA.getState('r1')
    expect(state).not.toBeNull()
    expect(state!.tasks.length).toBe(fulfilled.length)
  })
})
