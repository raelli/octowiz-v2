import { describe, it, expect } from 'vitest'
import { resolveRepoRoot } from './room.js'

describe('resolveRepoRoot', () => {
  it('prefers the first file:// MCP root', async () => {
    const listRoots = async () => ({ roots: [{ uri: 'file:///work/repo', name: 'repo' }] })
    expect(await resolveRepoRoot(listRoots, '/somewhere/else')).toBe('/work/repo')
  })

  it('falls back to cwd when no roots and git is unavailable', async () => {
    const listRoots = async () => ({ roots: [] })
    // /tmp is not a git repo -> git rev-parse fails -> cwd
    const root = await resolveRepoRoot(listRoots, '/tmp')
    expect(root).toBe('/tmp')
  })
})

import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoomLedger, FileLedgerStore } from '@octowiz/room-ledger'
import { ensureRoom } from './room.js'

describe('ensureRoom', () => {
  it('creates a room + opencode participant on first call and reuses it after', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'octowiz-room-'))
    const ledger = new RoomLedger(new FileLedgerStore(join(repoRoot, '.octowiz', 'ledger')))
    const now = () => '2026-06-25T01:02:03.456Z'

    const id1 = await ensureRoom(ledger, repoRoot, now)
    const id2 = await ensureRoom(ledger, repoRoot, now)
    expect(id1).toBe(id2)

    const state = await ledger.getState(id1)
    expect(state?.participants.some(p => p.id === 'opencode')).toBe(true)

    const pointer = JSON.parse(await readFile(join(repoRoot, '.octowiz', 'room.json'), 'utf8'))
    expect(pointer.roomId).toBe(id1)
  })
})
