import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it, vi } from 'vitest'
import { runCli } from './octowiz'
import { orchestrate } from './orchestrate'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-orch-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  let clock = 0
  const now = () => `2026-06-21T00:00:${String(clock++).padStart(2, '0')}Z`
  // One recording run across every leg: a PR URL for `gh pr create`, a fixture diff for
  // `git diff` (review's prompt), code 0 otherwise — which clears git/zellij AND the `noop`
  // validation check so validate passes, so the chain reaches a merge-ready state.
  const run = vi.fn(async (cmd: string, args: string[]) => {
    if (cmd === 'gh' && args.includes('create'))
      return { code: 0, stdout: 'https://github.com/raelli/octowiz-v2/pull/99\n', stderr: '' }
    if (cmd === 'git' && args.includes('diff'))
      return { code: 0, stdout: 'diff --git a/x b/x\n', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  })
  const provider: SandboxProvider = {
    name: 'fake',
    create: async (roomId, _opts) => ({ provider: 'fake', id: `sbx-${roomId}`, roomId }),
    destroy: async () => {},
  }
  const worker = async ({ role }: { role: string }) => ({ text: `${role}: looks good` })
  const aelliClient = async () => 'aelli: proceed with caution'
  const readFile = async () => JSON.stringify({ schemaVersion: '0.1.0', skills: [] })
  const skillRegistryPath = 'skills/registry.json'
  const checks = [{ name: 'noop', cmd: 'true', args: [] }]
  const deps = { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks }
  return { root, ledger, now, run, deps }
}

describe('orchestrate', () => {
  it('drives a task through the whole chain to merged with no escalation (happy path)', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const room = created.room.id
    const withTask = await runCli(['create-task', '--room', room, '--title', 'Ship it'], deps)
    const task = withTask.tasks[0]!.id

    const state = await orchestrate(
      { room, task, agent: 'impl-1', reviewer: 'rev-1', repo: '/repos/app', branch: 'feat/x', verdict: 'approved' },
      deps,
      runCli,
    )

    expect(state.tasks.find(t => t.id === task)?.status).toBe('merged')
    expect(state.escalations).toEqual([])
    // Persisted, not just the returned projection.
    const after = await ledger.getState(room)
    expect(after?.tasks.find(t => t.id === task)?.status).toBe('merged')
  })
})
