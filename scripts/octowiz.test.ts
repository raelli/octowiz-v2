import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatePullRequestBody } from '@octowiz/github-adapter'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it, vi } from 'vitest'
import { defaultRun, runCli } from './octowiz'

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
  // A vi.fn so tests can assert the worker's input (the reviewer prompt) and that an invalid
  // verdict short-circuits BEFORE the worker is ever called.
  const worker = vi.fn(async ({ role }: { role: string }) => ({ text: `${role}: looks good` }))
  const aelliClient = async () => 'aelli: proceed with caution'
  const readFile = async () => JSON.stringify({ schemaVersion: '0.1.0', skills: [] })
  const skillRegistryPath = 'skills/registry.json'
  // A trivial real-`pnpm`-free check so `validate` runs the injected list, not the monorepo suite.
  const checks = [{ name: 'noop', cmd: 'true', args: [] }]
  const deps = { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks }
  return { root, ledger, now, run, worker, provider, deps }
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

describe('defaultRun', () => {
  it('executes commands from the repository root', async () => {
    const expectedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
    const result = await defaultRun('node', ['-e', 'process.stdout.write(process.cwd())'])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe(expectedRoot)
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

  it('does not forward the host --repo path as sandbox workdir', async () => {
    const { deps } = await fixture()
    const create = vi.fn(async (roomId: string) => ({ provider: 'fake', id: `sbx-${roomId}`, roomId }))
    const provider: SandboxProvider = { name: 'fake', create, destroy: async () => {} }
    const created = await runCli(['create-room', '--name', 'Demo'], { ...deps, provider })
    await runCli(['start', '--room', created.room.id, '--repo', '/Users/demo/repo'], { ...deps, provider })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(created.room.id)
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

  it('rejects an invalid verdict at the CLI boundary without dispatching the worker', async () => {
    const { ledger, deps, worker } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await ledger.addParticipant(roomId, { id: 'imp', kind: 'agent', roles: ['implementer'], displayName: 'imp' }, deps.now())
    await ledger.assignTask(roomId, taskId, 'imp', deps.now())
    await expect(
      runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev', '--verdict', 'foo'], deps),
    ).rejects.toThrow(/invalid verdict/)
    // The validation short-circuits before any review is dispatched.
    expect(worker).not.toHaveBeenCalled()
  })

  it('passes the captured working-tree diff to the reviewer worker as its prompt', async () => {
    const { ledger, deps, worker } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await ledger.addParticipant(roomId, { id: 'imp', kind: 'agent', roles: ['implementer'], displayName: 'imp' }, deps.now())
    await ledger.assignTask(roomId, taskId, 'imp', deps.now())
    // `git -C <repo> diff` returns this fixture diff verbatim (trailing newline included);
    // the review case must hand it to the worker unchanged as the reviewer prompt.
    const diff = 'diff --git a/x b/x\n+real change\n'
    const run = vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === 'git' && args.includes('diff'))
        return { code: 0, stdout: diff, stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })
    await runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev', '--verdict', 'approved', '--repo', '/repos/app'], { ...deps, run })
    expect(worker).toHaveBeenCalledWith({ role: 'reviewer', prompt: diff })
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

describe('advise', () => {
  it('records advice when the cheap tier is approved', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    const dispatched: string[] = []
    const gatewayWorker = (modelId: string) => async () => {
      dispatched.push(modelId)
      return { text: `${modelId}: advice` }
    }
    const review = async () => 'approved' as const

    await runCli(
      ['advise', '--room', roomId, '--task', taskId, '--advisor', 'adv', '--reviewer', 'rev', '--tiers', 'cheap,expensive'],
      { ...deps, gatewayWorker, review },
    )

    expect(dispatched).toEqual(['cheap'])
    const state = await ledger.getState(roomId)
    expect(state?.advice).toHaveLength(1)
  })

  it('escalates when all tiers are rejected', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    const gatewayWorker = (modelId: string) => async () => ({ text: `${modelId}: advice` })
    const review = async () => 'rejected' as const

    await runCli(
      ['advise', '--room', roomId, '--task', taskId, '--advisor', 'adv', '--reviewer', 'rev', '--tiers', 'cheap,expensive'],
      { ...deps, gatewayWorker, review },
    )

    const state = await ledger.getState(roomId)
    expect(state?.escalations).toHaveLength(1)
  })

  it('rejects advisor equal to reviewer', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    const gatewayWorker = (_modelId: string) => async () => ({ text: 'advice' })
    const review = async () => 'approved' as const

    await expect(runCli(
      ['advise', '--room', roomId, '--task', taskId, '--advisor', 'x', '--reviewer', 'x', '--tiers', 'cheap'],
      { ...deps, gatewayWorker, review },
    )).rejects.toThrow(/no self-review/)
  })
})

describe('skills', () => {
  it('selects the stage\'s skills, prints their ids, and does not mutate the ledger', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    // A registry with one review-stage skill and one plan-stage skill: `--stage review`
    // must surface the review skill only. Triggers carry all 7 (empty) arrays the schema
    // requires; ids are drawn from the approved set.
    const empty = { taskType: [], repoStack: [], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] }
    const readFile = async () => JSON.stringify({
      schemaVersion: '0.1.0',
      skills: [
        { id: 'code-review', origin: 'native', workflowStage: 'review', triggers: empty },
        { id: 'task-planning', origin: 'native', workflowStage: 'plan', triggers: empty },
      ],
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const state = await runCli(['skills', '--room', roomId, '--task', 't', '--stage', 'review'], { ...deps, readFile })
    expect(log).toHaveBeenCalledWith('selected skills (review): code-review')
    log.mockRestore()
    // Read-only: the room state carries no new reviews/validations/escalations.
    expect(state.reviews).toEqual([])
    expect(state.validations).toEqual([])
    expect(state.escalations).toEqual([])
    const after = await ledger.getState(roomId)
    expect(after?.reviews).toEqual([])
  })

  it('rejects --stage all ("all" is a skill marker, not a workflow step)', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    await expect(runCli(['skills', '--room', roomId, '--stage', 'all'], deps)).rejects.toThrow(/unknown stage/)
  })

  it('rejects an unknown --stage value', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    await expect(runCli(['skills', '--room', roomId, '--stage', 'bogus'], deps)).rejects.toThrow(/unknown stage/)
  })
})

describe('deliver', () => {
  it('refuses a not-merge-ready task and surfaces the unmet reasons', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    // A fresh task: open, unassigned, no validation/review — squarely not merge-ready.
    // No --branch: the readiness gate throws before the deliver case reads --branch, so the
    // refusal must not depend on it.
    await expect(
      runCli(['deliver', '--room', roomId, '--task', taskId], deps),
    ).rejects.toThrow(/not ready to merge/i)
  })

  it('opens a PR and sets status merged for a merge-ready task', async () => {
    const { deps } = await fixture()
    const url = 'https://github.com/raelli/octowiz-v2/pull/99'
    // One recording run across every leg: the PR URL for `gh pr create`, code 0 otherwise —
    // which clears git (switch/push) AND the `noop` validation check so validate passes.
    const run = vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === 'gh' && args.includes('create'))
        return { code: 0, stdout: `${url}\n`, stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })
    const d = { ...deps, run }
    const created = await runCli(['create-room', '--name', 'Demo'], d)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'Ship it'], d)
    const taskId = withTask.tasks[0]!.id
    // Drive the real commands to a merge-ready state: assign → validate (passes) → approve.
    await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], d)
    await runCli(['validate', '--room', roomId, '--task', taskId], d)
    await runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev-1', '--verdict', 'approved'], d)

    // Capture the room state the deliver case will read to build the PR body: deliver only
    // mutates (status -> merged) AFTER computing the body, and generatePullRequestBody is pure,
    // so this state produces the exact body the command passes to `gh pr create`.
    const preDeliver = (await d.ledger.getState(roomId))!
    const expectedBody = generatePullRequestBody(preDeliver, taskId)

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const state = await runCli(['deliver', '--room', roomId, '--task', taskId, '--branch', 'feat/x', '--base', 'main'], d)
    expect(log).toHaveBeenCalledWith(url)
    log.mockRestore()

    // The PR was opened via `gh pr create` with the exact argv (order matches openPullRequest):
    // --base main --head feat/x --title <task title> --body <generatePullRequestBody>.
    const ghCall = run.mock.calls.find(([cmd, args]) => cmd === 'gh' && args.includes('create'))!
    expect(ghCall[1]).toEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'feat/x',
      '--title',
      'Ship it',
      '--body',
      expectedBody,
    ])
    // ...and the task advanced to merged.
    expect(state.tasks.find(t => t.id === taskId)?.status).toBe('merged')
  })

  it('rejects an explicit empty --base on an otherwise merge-ready task', async () => {
    const { deps } = await fixture()
    const run = vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === 'gh' && args.includes('create'))
        return { code: 0, stdout: 'https://github.com/raelli/octowiz-v2/pull/1\n', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })
    const d = { ...deps, run }
    const created = await runCli(['create-room', '--name', 'Demo'], d)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'Ship it'], d)
    const taskId = withTask.tasks[0]!.id
    // Drive to merge-ready so the empty-base guard (which sits past the readiness gate and
    // after --branch) is the assertion that actually fires.
    await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], d)
    await runCli(['validate', '--room', roomId, '--task', taskId], d)
    await runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev-1', '--verdict', 'approved'], d)
    await expect(
      runCli(['deliver', '--room', roomId, '--task', taskId, '--branch', 'feat/x', '--base', ''], d),
    ).rejects.toThrow(/base must not be empty/)
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
