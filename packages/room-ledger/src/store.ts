import type { LedgerEvent } from '@octowiz/schemas'
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { SCHEMAS_VERSION, StoredLedgerEventSchema } from '@octowiz/schemas'

/** Storage backend for a room's append-only event log. Backend-agnostic by design. */
export interface LedgerStore {
  appendEvent: (roomId: string, event: LedgerEvent) => Promise<void>
  readEvents: (roomId: string) => Promise<LedgerEvent[]>
  listRooms: () => Promise<string[]>
}

const EVENTS_FILE = 'events.jsonl'

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

/**
 * A room id maps to a single directory under the ledger root, so it must be a flat,
 * safe path segment. Reject anything that could escape the root (separators, `..`,
 * absolute paths) — the id reaches us across a trust boundary (it comes from parsed
 * events / callers), so this is enforced before any path is derived.
 */
function assertSafeRoomId(roomId: string): void {
  if (roomId.trim() === '' || roomId === '.' || roomId === '..' || isAbsolute(roomId) || /[/\\]/.test(roomId))
    throw new Error(`unsafe room id: ${JSON.stringify(roomId)}`)
}

/** File-backed store: one `<rootDir>/<roomId>/events.jsonl` per room, one event per line. */
export class FileLedgerStore implements LedgerStore {
  constructor(private readonly rootDir: string) {}

  async appendEvent(roomId: string, event: LedgerEvent): Promise<void> {
    assertSafeRoomId(roomId)
    // Validate at the persistence boundary, symmetric with readEvents: parse the envelope
    // (which validates the event and stamps the version) BEFORE touching the filesystem,
    // and persist the parsed value. An untyped/JS caller passing a malformed event is
    // rejected here rather than writing a line that readEvents would later reject forever.
    const stored = StoredLedgerEventSchema.parse({ schemaVersion: SCHEMAS_VERSION, event })
    const dir = join(this.rootDir, roomId)
    await mkdir(dir, { recursive: true })
    await appendFile(join(dir, EVENTS_FILE), `${JSON.stringify(stored)}\n`, 'utf8')
  }

  async readEvents(roomId: string): Promise<LedgerEvent[]> {
    assertSafeRoomId(roomId)
    let raw: string
    try {
      raw = await readFile(join(this.rootDir, roomId, EVENTS_FILE), 'utf8')
    }
    catch (error) {
      if (isENOENT(error))
        return []
      throw error
    }
    // Files are a trust boundary (hand-editable) — parse every line, don't cast.
    // StoredLedgerEventSchema also rejects lines written under a different schema version.
    return raw
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => StoredLedgerEventSchema.parse(JSON.parse(line)).event)
  }

  async listRooms(): Promise<string[]> {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true })
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
    }
    catch (error) {
      if (isENOENT(error))
        return []
      throw error
    }
  }
}
