import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { sessionName } from '@octowiz/zellij-adapter'
import { expect, it } from 'vitest'
import { defaultRun, runCli } from './octowiz'

// End-to-end smoke for the M4 tracer against the REAL zellij binary. Per the spec, real
// binaries stay out of the default unit gate: this runs only when OCTOWIZ_SMOKE is set
// (`OCTOWIZ_SMOKE=1 pnpm --filter @octowiz/cli test`). Without it — or without zellij
// installed — the test reports as SKIPPED (not a false-green pass). The opencode leg is
// dispatched into the pane but not asserted to start (binary not installed — slice 3).
it('creates a real zellij session and records both session.started events', async (ctx) => {
  if (!process.env.OCTOWIZ_SMOKE)
    return ctx.skip()
  const { code } = await defaultRun('zellij', ['--version'])
  if (code !== 0)
    return ctx.skip()

  const root = await mkdtemp(join(tmpdir(), 'octowiz-smoke-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  const now = () => new Date().toISOString()

  const state = await runCli(['up', '--name', 'SmokeRoom', '--repo', process.cwd()], { ledger, run: defaultRun, now })
  const name = sessionName(state.room.id)
  try {
    expect(state.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
    const list = await defaultRun('zellij', ['list-sessions', '-n', '-s'])
    expect(list.stdout).toContain(name)
  }
  finally {
    await defaultRun('zellij', ['delete-session', name, '--force'])
  }
})
