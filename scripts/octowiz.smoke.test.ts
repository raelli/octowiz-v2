import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { sessionName } from '@octowiz/zellij-adapter'
import { beforeAll, expect, it } from 'vitest'
import { defaultRun, runCli } from './octowiz'

// End-to-end smoke for the M4 tracer against the REAL zellij binary. Skips when zellij
// is absent (e.g. CI), so the gate stays green; runs the genuine create→ensureSession→
// runInSession→record path locally. The opencode leg is dispatched into the pane but is
// NOT asserted to start (opencode not installed — spec slice 3 deferred).
let hasZellij = false
beforeAll(async () => {
  const { code } = await defaultRun('zellij', ['--version'])
  hasZellij = code === 0
})

it('creates a real zellij session and records both session.started events', async () => {
  if (!hasZellij) {
    console.warn('zellij not installed — skipping real-binary smoke')
    return
  }
  const root = await mkdtemp(join(tmpdir(), 'octowiz-smoke-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  const now = () => new Date().toISOString()

  const state = await runCli(['up', '--name', 'SmokeRoom', '--repo', process.cwd()], { ledger, run: defaultRun, now })
  const name = sessionName(state.room.id)
  try {
    // Ledger recorded both legs.
    expect(state.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
    // The session actually exists in zellij.
    const list = await defaultRun('zellij', ['list-sessions', '-n', '-s'])
    expect(list.stdout).toContain(name)
  }
  finally {
    await defaultRun('zellij', ['delete-session', name, '--force'])
  }
})
