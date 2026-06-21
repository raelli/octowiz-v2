import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import { execFile } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it, vi } from 'vitest'
import { runCli } from './octowiz'

// The acceptance proof of M11: all 10 MVP features composing in ONE run. The fixture's `run`
// DISPATCHES by command — validation genuinely shells out to REAL pnpm against a tiny fixture
// workspace (cwd-bound), while git/gh/zellij are recorded fixtures. The single trivial check
// keeps validation off the recursive monorepo suite.
const execFileAsync = promisify(execFile)
const fixtureWorkspace = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'validate-workspace')

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-e2e-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  let clock = 0
  const now = () => `2026-06-21T00:00:${String(clock++).padStart(2, '0')}Z`
  // Every (cmd, args) is recorded for argv assertions, THEN dispatched by command:
  //  - pnpm        → REALLY execute in the fixture workspace (validation shells out for real),
  //  - gh ...create→ a fixture PR URL, git ...diff → a fixture diff (review's prompt),
  //  - everything else (git/zellij) → a clean { code: 0 }.
  const calls: Array<[string, string[]]> = []
  const run = vi.fn(async (cmd: string, args: string[]) => {
    calls.push([cmd, args])
    if (cmd === 'pnpm') {
      // Mirror defaultRun's non-zero mapping (execFile rejects on a non-zero exit), but bind
      // cwd to the fixture workspace so `pnpm run check` resolves the fixture's script.
      try {
        const { stdout, stderr } = await execFileAsync('pnpm', args, { cwd: fixtureWorkspace })
        return { code: 0, stdout, stderr }
      }
      catch (error) {
        const e = error as { code?: number, stdout?: string, stderr?: string }
        return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(error) }
      }
    }
    if (cmd === 'gh' && args.includes('create'))
      return { code: 0, stdout: 'https://github.com/raelli/octowiz-v2/pull/123\n', stderr: '' }
    if (cmd === 'git' && args.includes('diff'))
      return { code: 0, stdout: 'diff --git a/x b/x\n+real change\n', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  })
  const provider: SandboxProvider = {
    name: 'fake',
    create: async (roomId, _opts) => ({ provider: 'fake', id: `sbx-${roomId}`, roomId }),
    destroy: async () => {},
  }
  const worker = async ({ role }: { role: string }) => ({ text: `${role}: ok` })
  const aelliClient = async () => 'aelli: proceed with caution'
  // A registry with one review-stage and one cross-cutting ('all') skill: ids drawn from the
  // approved set, triggers carry all 7 (empty) arrays the schema requires.
  const empty = { taskType: [], repoStack: [], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] }
  const readFile = async () => JSON.stringify({
    schemaVersion: '0.1.0',
    skills: [
      { id: 'code-review', origin: 'native', workflowStage: 'review', triggers: empty },
      { id: 'ledger-recording', origin: 'native', workflowStage: 'all', triggers: empty },
    ],
  })
  const skillRegistryPath = 'skills/registry.json'
  // The single trivial REAL-pnpm check — NOT DEFAULT_CHECKS, which would recursively run the
  // whole monorepo suite. `pnpm run check` shells out for real against the fixture workspace.
  const checks = [{ name: 'check', cmd: 'pnpm', args: ['run', 'check'] }]
  const deps = { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks }
  return { root, ledger, now, run, calls, deps }
}

describe('acceptance: all 10 MVP features compose in one run', () => {
  it('happy path via run-task proves features 1-7, 9, 10', async () => {
    const { root, deps, calls } = await fixture()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    // F1: create room. Then a task to drive.
    const created = await runCli(['create-room', '--name', 'M11'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'Wire it up'], deps)
    const taskId = withTask.tasks[0]!.id

    // The whole flow in one run: assign → start → validate → skills → review → escalate → deliver.
    const state = await runCli([
      'run-task',
      '--room',
      roomId,
      '--task',
      taskId,
      '--agent',
      'impl-1',
      '--reviewer',
      'rev-1',
      '--repo',
      '/repos/app',
      '--branch',
      'feat/m11',
      '--verdict',
      'approved',
    ], deps)

    // F2/F3: a zellij session then opencode, and opencode launched THROUGH a zellij run.
    expect(state.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
    expect(calls.some(([cmd, args]) => cmd === 'zellij' && args.join(' ').includes('opencode'))).toBe(true)

    // F4: assigned to one agent.
    expect(state.tasks.find(t => t.id === taskId)?.implementerId).toBe('impl-1')

    // F5: the ledger accumulated the lifecycle, ending merged.
    expect(state.tasks.find(t => t.id === taskId)?.status).toBe('merged')

    // F6: validation ran REAL pnpm (a recorded pnpm 'check' call) and passed.
    expect(calls.some(([cmd, args]) => cmd === 'pnpm' && args.includes('check'))).toBe(true)
    expect(state.validations.at(-1)?.status).toBe('passed')

    // F7: a separate reviewer (≠ implementer) recorded an approval.
    expect(state.reviews[0]).toMatchObject({ reviewerId: 'rev-1', verdict: 'approved' })
    expect(state.reviews[0]?.reviewerId).not.toBe(state.tasks.find(t => t.id === taskId)?.implementerId)

    // F9: a GitHub-ready PR opened — gh create argv recorded AND the URL printed.
    expect(calls.some(([cmd, args]) => cmd === 'gh' && args.includes('create'))).toBe(true)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('pull/123'))
    log.mockRestore()

    // F10: the web server route is a thin wrapper over RoomLedger.getState — read the SAME
    // projection it reads (a fresh ledger over the same dir) and assert it equals the CLI's
    // final RoomState. Projection-equality proves the web reads the same state, no Nuxt boot.
    const webState = await new RoomLedger(new FileLedgerStore(root)).getState(roomId)
    expect(webState).toEqual(state)
  }, 30_000)

  it('feature 8: a rejected review escalates to ÆLLI and stops before delivery', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'M11'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'Wire it up'], deps)
    const taskId = withTask.tasks[0]!.id

    const state = await runCli([
      'run-task',
      '--room',
      roomId,
      '--task',
      taskId,
      '--agent',
      'impl-1',
      '--reviewer',
      'rev-1',
      '--repo',
      '/repos/app',
      '--branch',
      'feat/m11',
      '--verdict',
      'rejected',
    ], deps)

    // The rejection triggered an escalation carrying the stub recommendation...
    expect(state.escalations).toHaveLength(1)
    expect(state.escalations[0]).toMatchObject({ taskId, recommendation: 'aelli: proceed with caution' })
    // ...and the run stopped before delivery: the task was never merged.
    expect(state.tasks.find(t => t.id === taskId)?.status).not.toBe('merged')
    const after = await ledger.getState(roomId)
    expect(after?.tasks.find(t => t.id === taskId)?.status).not.toBe('merged')
  }, 30_000)
})
