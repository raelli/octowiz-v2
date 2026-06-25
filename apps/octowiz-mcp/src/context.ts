import type { ServerDeps } from './server.js'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { ensureRoom } from './room.js'

export interface Ctx { ledger: RoomLedger, roomId: string }
export interface ToolResult { [x: string]: unknown, content: { type: 'text', text: string }[], isError?: boolean }

export function okText(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

export function errText(message: string): ToolResult {
  return { content: [{ type: 'text', text: `octowiz: ${message}` }], isError: true }
}

/** Wrap a handler so any throw becomes a readable isError result — the server stays alive. */
export function failOpen<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args)
    }
    catch (error) {
      return errText(error instanceof Error ? error.message : String(error))
    }
  }
}

export function makeContext(deps: ServerDeps): () => Promise<Ctx> {
  let cached: Ctx | undefined
  return async () => {
    if (cached)
      return cached
    const ledgerDir = await deps.ledgerDirFor()
    const ledger = new RoomLedger(new FileLedgerStore(ledgerDir))
    // repoRoot for ensureRoom = parent of `<root>/.octowiz/ledger`
    const repoRoot = ledgerDir.replace(/\/\.octowiz\/ledger$/, '')
    const roomId = await ensureRoom(ledger, repoRoot, deps.now)
    cached = { ledger, roomId }
    return cached
  }
}
