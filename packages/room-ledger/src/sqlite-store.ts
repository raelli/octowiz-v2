import type { LedgerEvent } from '@octowiz/schemas'
import type { LedgerStore } from './store'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SCHEMAS_VERSION, StoredLedgerEventSchema } from '@octowiz/schemas'
import { assertSafeRoomId } from './store'

/** An append lost a read-validate-append race: the room's log grew since it was read. */
export class ConcurrentWriteError extends Error {}

/**
 * SQLite-backed store (`node:sqlite`, no dependency). Unlike FileLedgerStore this
 * supports concurrent writers: `appendEvent` with an `expectedCount` commits only if
 * the room's log is still exactly that long, so a racing writer gets a
 * ConcurrentWriteError instead of corrupting the replay.
 */
export class SqliteLedgerStore implements LedgerStore {
  private readonly db: DatabaseSync

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    // WAL + busy_timeout: concurrent connections (other processes) block briefly
    // instead of failing with SQLITE_BUSY.
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS events (
        seq     INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        data    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_room ON events (room_id);
    `)
  }

  async appendEvent(roomId: string, event: LedgerEvent, expectedCount?: number): Promise<void> {
    assertSafeRoomId(roomId)
    // Same boundary discipline as FileLedgerStore: parse the envelope (validates the
    // event, stamps the version) before touching storage; persist the parsed value.
    const stored = StoredLedgerEventSchema.parse({ schemaVersion: SCHEMAS_VERSION, event })
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (expectedCount !== undefined) {
        const row = this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE room_id = ?').get(roomId) as { n: number }
        if (row.n !== expectedCount)
          throw new ConcurrentWriteError(`room "${roomId}": expected ${expectedCount} events, found ${row.n}`)
      }
      this.db.prepare('INSERT INTO events (room_id, data) VALUES (?, ?)').run(roomId, JSON.stringify(stored))
      this.db.exec('COMMIT')
    }
    catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  async readEvents(roomId: string): Promise<LedgerEvent[]> {
    assertSafeRoomId(roomId)
    const rows = this.db.prepare('SELECT data FROM events WHERE room_id = ? ORDER BY seq').all(roomId) as { data: string }[]
    // The db file is a trust boundary (hand-editable) — parse every row, don't cast.
    return rows.map(row => StoredLedgerEventSchema.parse(JSON.parse(row.data)).event)
  }

  async listRooms(): Promise<string[]> {
    const rows = this.db.prepare('SELECT DISTINCT room_id FROM events ORDER BY room_id').all() as { room_id: string }[]
    return rows.map(row => row.room_id)
  }
}
