import type { RoomLedger } from '@octowiz/room-ledger'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ListRoots = () => Promise<{ roots: { uri: string, name?: string }[] }>

/** Resolve the repo root: MCP roots (switch-safe) → git toplevel from cwd → cwd. */
export async function resolveRepoRoot(listRoots: ListRoots | undefined, cwd: string): Promise<string> {
  if (listRoots) {
    try {
      const { roots } = await listRoots()
      const first = roots.find(r => r.uri.startsWith('file://'))
      if (first)
        return fileURLToPath(first.uri)
    }
    catch { /* fall through to git/cwd */ }
  }
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd })
    const top = stdout.trim()
    if (top)
      return top
  }
  catch { /* not a git repo */ }
  return cwd
}

export function makeLedgerResolver(opts: { listRoots?: ListRoots, cwd: string }): () => Promise<string> {
  // ponytail: cache repo root for the session; re-resolve on roots/list_changed when multi-project-per-session matters
  let cached: string | undefined
  return async () => {
    if (cached)
      return cached
    const root = await resolveRepoRoot(opts.listRoots, opts.cwd)
    cached = join(root, '.octowiz', 'ledger')
    return cached
  }
}

export async function ensureRoom(ledger: RoomLedger, repoRoot: string, now: () => string): Promise<string> {
  const pointer = join(repoRoot, '.octowiz', 'room.json')
  try {
    const { roomId } = JSON.parse(await readFile(pointer, 'utf8')) as { roomId?: string }
    if (roomId && await ledger.getState(roomId))
      return roomId
  }
  catch { /* no pointer yet, or stale -> recreate */ }

  const at = now()
  const id = `r${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
  await ledger.createRoom({ id, name: basename(repoRoot), status: 'active', createdAt: at }, at)
  await ledger.addParticipant(id, { id: 'opencode', kind: 'agent', roles: ['advisor'], displayName: 'opencode session' }, at)
  await ledger.recordSessionStart(id, 'opencode', `octowiz-${id}`, at)

  await mkdir(dirname(pointer), { recursive: true })
  await writeFile(pointer, `${JSON.stringify({ roomId: id }, null, 2)}\n`)
  return id
}
