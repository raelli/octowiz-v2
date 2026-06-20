import type { LedgerEvent } from '@octowiz/schemas'
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { LedgerEventSchema } from '@octowiz/schemas'

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
  if (roomId === '.' || roomId === '..' || isAbsolute(roomId) || /[/\\]/.test(roomId))
    throw new Error(`unsafe room id: ${JSON.stringify(roomId)}`)
}

/** File-backed store: one `<rootDir>/<roomId>/events.jsonl` per room, one event per line. */
export class FileLedgerStore implements LedgerStore {
  constructor(private readonly rootDir: string) {}

  async appendEvent(roomId: string, event: LedgerEvent): Promise<void> {
    assertSafeRoomId(roomId)
    const dir = join(this.rootDir, roomId)
    await mkdir(dir, { recursive: true })
    await appendFile(join(dir, EVENTS_FILE), `${JSON.stringify(event)}\n`, 'utf8')
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
    return raw
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => LedgerEventSchema.parse(JSON.parse(line)))
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
