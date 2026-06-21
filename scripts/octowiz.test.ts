import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it, vi } from 'vitest'
import { runCli } from './octowiz'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-cli-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  let clock = 0
  const now = () => `2026-06-21T00:00:${String(clock++).padStart(2, '0')}Z`
  const run = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
  // Fake provider: hermetic, no real container — proves the CLI goes through the seam.
  const provider: SandboxProvider = {
    name: 'fake',
    create: async (roomId, _opts) => ({ provider: 'fake', id: `sbx-${roomId}`, roomId }),
    destroy: async () => {},
  }
  // Stub the new seams: hermetic, no real model/ÆLLI/registry. No command consumes them in
  // this slice — they exist so the enlarged Deps stays satisfiable — but later slices will.
  const worker = async ({ role }: { role: string }) => ({ text: `${role}: looks good` })
  const aelliClient = async () => 'aelli: proceed with caution'
  const readFile = async () => JSON.stringify({ schemaVersion: '0.1.0', skills: [] })
  const skillRegistryPath = 'skills/registry.json'
  // A trivial real-`pnpm`-free check so `validate` runs the injected list, not the monorepo suite.
  const checks = [{ name: 'noop', cmd: 'true', args: [] }]
  const deps = { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks }
  return { root, ledger, now, run, provider, deps }
}

describe('create-room', () => {
  it('writes a room.created event', async () => {
    const { root, deps } = await fixture()
    const state = await runCli(['create-room', '--name', 'Demo'], deps)
    expect(state.room.name).toBe('Demo')
    const rooms = await new FileLedgerStore(root).listRooms()
    expect(rooms).toEqual([state.room.id])
  })
})

describe('start', () => {
  it('creates a sandbox before sessions, then records zellij + opencode', async () => {
    const { ledger, deps, run } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    await runCli(['start', '--room', roomId, '--repo', '/repos/app'], deps)
    const after = await ledger.getState(roomId)
    // The sandbox is created via the provider and recorded...
    expect(after?.sandboxes).toEqual([{ provider: 'fake', sandboxId: `sbx-${roomId}`, at: expect.any(String) }])
    // ...before the session legs (its timestamp precedes the first session's).
    expect(after!.sandboxes[0]!.at < after!.sessions[0]!.at).toBe(true)
    expect(after?.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
    const dispatchedOpencode = run.mock.calls.some(([cmd, args]) => cmd === 'zellij' && args.join(' ').includes('opencode'))
    expect(dispatchedOpencode).toBe(true)
  })
})

describe('create-task', () => {
  it('creates an open task in the room', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const state = await runCli(['create-task', '--room', roomId, '--title', 'Wire it up'], deps)
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0]).toMatchObject({ title: 'Wire it up', status: 'open', roomId })
  })
})

describe('validate', () => {
  it('records a Validation to the ledger for an existing task', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await runCli(['validate', '--room', roomId, '--task', taskId], deps)
    const after = await ledger.getState(roomId)
    expect(after?.validations).toHaveLength(1)
    expect(after?.validations[0]?.status).toBe('passed')
  })

  it('fails fast on an unknown task without running any checks', async () => {
    const { deps, run } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    await expect(runCli(['validate', '--room', roomId, '--task', 'ghost'], deps)).rejects.toThrow(/ghost/)
    // The expensive check suite must not have run before the guaranteed failure.
    expect(run).not.toHaveBeenCalled()
  })
})

describe('up', () => {
  it('creates a room, a sandbox, and starts its sessions in one command', async () => {
    const { deps } = await fixture()
    const state = await runCli(['up', '--name', 'Demo', '--repo', '/repos/app'], deps)
    expect(state.sandboxes).toHaveLength(1)
    expect(state.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
  })
})

describe('escalate', () => {
  it('records an ÆLLI escalation with the stub recommendation when a review rejected the task', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    // Seed the rejected-review state through the ledger directly — assign/review commands
    // may not exist on this branch, and shouldEscalate only needs the recorded events.
    await ledger.addParticipant(roomId, { id: 'rev', kind: 'agent', roles: ['reviewer'], displayName: 'Rev' }, deps.now())
    await ledger.assignTask(roomId, taskId, 'rev', deps.now())
    await ledger.recordReview(roomId, { id: 'rv1', taskId, reviewerId: 'rev', verdict: 'rejected', createdAt: deps.now() }, deps.now())

    await runCli(['escalate', '--room', roomId, '--task', taskId], deps)

    const after = await ledger.getState(roomId)
    expect(after?.escalations).toHaveLength(1)
    expect(after?.escalations[0]).toMatchObject({
      roomId,
      taskId,
      reason: 'a review rejected the task',
      recommendation: 'aelli: proceed with caution',
    })
  })

  it('is a no-op when nothing triggers (no escalation recorded)', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id

    await runCli(['escalate', '--room', roomId, '--task', taskId], deps)

    const after = await ledger.getState(roomId)
    expect(after?.escalations).toEqual([])
  })
})

describe('errors', () => {
  it('throws on an unknown subcommand', async () => {
    const { deps } = await fixture()
    await expect(runCli(['bogus'], deps)).rejects.toThrow(/unknown subcommand/)
  })

  it('throws when a required flag is missing', async () => {
    const { deps } = await fixture()
    await expect(runCli(['create-room'], deps)).rejects.toThrow(/--name/)
  })
})
