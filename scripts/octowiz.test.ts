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

describe('assign', () => {
  it('registers the implementer participant, assigns the task, and sets in_progress', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    const state = await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], deps)
    expect(state.participants).toContainEqual({ id: 'impl-1', kind: 'agent', roles: ['implementer'], displayName: 'impl-1' })
    const after = await ledger.getState(roomId)
    expect(after?.tasks[0]?.implementerId).toBe('impl-1')
    expect(after?.tasks[0]?.status).toBe('in_progress')
  })

  it('is idempotent on the participant when the agent is already registered', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const t1 = await runCli(['create-task', '--room', roomId, '--title', 'A'], deps)
    await runCli(['assign', '--room', roomId, '--task', t1.tasks[0]!.id, '--agent', 'impl-1'], deps)
    const t2 = await runCli(['create-task', '--room', roomId, '--title', 'B'], deps)
    const taskId = t2.tasks.find(t => t.title === 'B')!.id
    const state = await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], deps)
    expect(state.participants.filter(p => p.id === 'impl-1')).toHaveLength(1)
  })

  it('rejects when the existing participant is not an agent implementer', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    // Seed a same-id participant that lacks the implementer role: the guard must fail loudly
    // rather than silently assigning to a non-implementer (the ledger has no role-update event).
    await ledger.addParticipant(roomId, { id: 'x', kind: 'agent', roles: ['reviewer'], displayName: 'X' }, deps.now())
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await expect(runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'x'], deps)).rejects.toThrow(/already exists without the agent implementer role/)
  })

  it('fails fast on an unknown task without writing an orphan participant', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    await expect(runCli(['assign', '--room', roomId, '--task', 'ghost', '--agent', 'impl-1'], deps)).rejects.toThrow(/not found/)
    const after = await ledger.getState(roomId)
    expect(after?.participants.some(p => p.id === 'impl-1')).toBe(false)
  })

  it('fails fast on an unknown room', async () => {
    const { deps } = await fixture()
    await expect(runCli(['assign', '--room', 'no-room', '--task', 't', '--agent', 'impl-1'], deps)).rejects.toThrow(/room "no-room" not found/)
  })
})

describe('validate status advance', () => {
  it('advances a passing task to validated', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await runCli(['validate', '--room', roomId, '--task', taskId], deps)
    const after = await ledger.getState(roomId)
    expect(after?.tasks[0]?.status).toBe('validated')
  })

  it('leaves a failing task\'s status unchanged', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    // A non-zero check exit makes the validation fail; status must stay put for escalate later.
    const failing = { ...deps, run: vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'boom' }) }
    const state = await runCli(['validate', '--room', roomId, '--task', taskId], failing)
    expect(state.validations[0]?.status).toBe('failed')
    expect(state.tasks[0]?.status).toBe('open')
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

describe('review', () => {
  it('records an approving review from a different reviewer in room state', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    // Set up the implementer directly via the ledger (no `assign` command on this branch).
    await ledger.addParticipant(roomId, { id: 'imp', kind: 'agent', roles: ['implementer'], displayName: 'imp' }, deps.now())
    await ledger.assignTask(roomId, taskId, 'imp', deps.now())

    const state = await runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev', '--verdict', 'approved'], deps)

    expect(state.participants.some(p => p.id === 'rev' && p.roles.includes('reviewer'))).toBe(true)
    expect(state.reviews).toHaveLength(1)
    expect(state.reviews[0]).toMatchObject({ taskId, reviewerId: 'rev', verdict: 'approved', notes: 'reviewer: looks good' })
  })

  it('refuses a self-review (reviewer is the task implementer)', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    // 'imp' must hold the reviewer role to clear the role guard so canReview is the gate that
    // refuses — it's the task's implementer, so self-review is the rejection we want to assert.
    await ledger.addParticipant(roomId, { id: 'imp', kind: 'agent', roles: ['implementer', 'reviewer'], displayName: 'imp' }, deps.now())
    await ledger.assignTask(roomId, taskId, 'imp', deps.now())

    await expect(
      runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'imp', '--verdict', 'approved'], deps),
    ).rejects.toThrow(/no self-review/)
    expect((await ledger.getState(roomId))?.reviews).toEqual([])
  })

  it('rejects when the existing reviewer participant lacks the agent reviewer role', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    // Seed a same-id participant without the reviewer role: the guard must fail loudly rather
    // than skip registration and let canReview throw a misleading "no self-review" error.
    await ledger.addParticipant(roomId, { id: 'rev', kind: 'agent', roles: ['validator'], displayName: 'rev' }, deps.now())
    await expect(
      runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev', '--verdict', 'approved'], deps),
    ).rejects.toThrow(/already exists without the agent reviewer role/)
  })

  it('fails fast on an unknown task without writing an orphan reviewer participant', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    await expect(
      runCli(['review', '--room', roomId, '--task', 'ghost', '--reviewer', 'rev', '--verdict', 'approved'], deps),
    ).rejects.toThrow(/not found/)
    const after = await ledger.getState(roomId)
    expect(after?.participants.some(p => p.id === 'rev')).toBe(false)
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
