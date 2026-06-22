import type { AelliClient } from '@octowiz/aelli-adapter'
import type { AgentWorker } from '@octowiz/agent-runtime'
import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import type { ReviewVerdict, RoomState } from '@octowiz/schemas'
import type { ReadFile, WorkflowStage } from '@octowiz/skill-runtime'
import type { Check } from '@octowiz/validation'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { buildEscalationRequest, createA2aAelliClient, recordAelliEscalation, shouldEscalate } from '@octowiz/aelli-adapter'
import { createLocalModelWorker, dispatchReview } from '@octowiz/agent-runtime'
import { isMergeReady } from '@octowiz/doctrine'
import { generatePullRequestBody, openPullRequestForBranch } from '@octowiz/github-adapter'
import { startArgs } from '@octowiz/opencode-adapter'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { selectProvider } from '@octowiz/sandbox-runtime'
import { ReviewVerdictSchema } from '@octowiz/schemas'
import { defaultReadFile, loadApprovedSkills, selectSkills } from '@octowiz/skill-runtime'
import { DEFAULT_CHECKS, runValidation } from '@octowiz/validation'
import { ensureSession, runInSession, sessionName } from '@octowiz/zellij-adapter'
import { gitDiff } from './git-diff'
import { orchestrate } from './orchestrate'

type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

export interface Deps {
  ledger: RoomLedger
  run: Run
  now: () => string
  provider: SandboxProvider
  // Injected seams for the later M11 subcommand slices — wired here so the composition root
  // can drive the runtime packages, but no command consumes them yet (this slice is the spine).
  worker: AgentWorker
  aelliClient: AelliClient
  readFile: ReadFile
  skillRegistryPath: string
  // Injectable so tests/acceptance supply trivial real-`pnpm` checks instead of recursively
  // running the monorepo suite; defaults to the validation package's DEFAULT_CHECKS.
  checks: Check[]
}

const execFileAsync = promisify(execFile)

/**
 * The one real exec seam: wrap node:child_process. A non-zero exit must NOT reject —
 * execFile rejects on non-zero, so map that back into our { code, stdout, stderr } shape
 * (the adapters/validation decide what a non-zero code means).
 */
export const defaultRun: Run = async (cmd, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args)
    return { code: 0, stdout, stderr }
  }
  catch (error) {
    const e = error as { code?: number, stdout?: string, stderr?: string }
    return {
      code: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(error),
    }
  }
}

function flag(values: Record<string, unknown>, name: string): string {
  const v = values[name]
  if (typeof v !== 'string' || v === '')
    throw new Error(`missing required --${name}`)
  return v
}

export async function runCli(argv: string[], deps: Deps): Promise<RoomState> {
  const [subcommand, ...rest] = argv
  const { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks = DEFAULT_CHECKS } = deps
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      room: { type: 'string' },
      repo: { type: 'string' },
      reviewer: { type: 'string' },
      task: { type: 'string' },
      title: { type: 'string' },
      verdict: { type: 'string' },
      agent: { type: 'string' },
      stage: { type: 'string' },
      branch: { type: 'string' },
      base: { type: 'string' },
    },
    allowPositionals: false,
  })

  switch (subcommand) {
    case 'create-room': {
      const name = flag(values, 'name')
      const at = now()
      // Keep the id short: sessionName is `octowiz-<id>`, and zellij's IPC socket path
      // (socket dir + name) must stay under ~103 bytes — a long id overflows it. Derive
      // a compact, path-safe token from the timestamp.
      // ponytail: drops the date prefix, keeping time-of-day+ms — so two rooms collide
      // only at the same millisecond-of-day on different days in one ledger (and a
      // collision fails closed: createRoom throws, no corruption). Swap for a ULID if it
      // ever bites. Kept short so `octowiz-<id>` stays under zellij's ~103-byte socket path.
      const id = `r${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
      return ledger.createRoom({ id, name, status: 'active', createdAt: at }, at)
    }
    case 'create-task': {
      const roomId = flag(values, 'room')
      const title = flag(values, 'title')
      const at = now()
      const id = `t${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
      return ledger.createTask({ id, roomId, title, status: 'open' }, at)
    }
    case 'start': {
      const roomId = flag(values, 'room')
      const repo = flag(values, 'repo')
      const name = sessionName(roomId)
      // Room lifecycle goes THROUGH the provider seam: create the sandbox and record it
      // before the zellij/opencode legs. M4 stayed host-first deliberately, so the legs
      // still launch on the host for now — wiring opencode to run inside the sandbox is a
      // later milestone; this slice proves the lifecycle depends on the interface.
      const sandbox = await provider.create(roomId, { workdir: repo })
      await ledger.recordSandboxStart(roomId, sandbox.provider, sandbox.id, now())
      await ensureSession(roomId, run)
      await ledger.recordSessionStart(roomId, 'zellij', name, now())
      await runInSession(roomId, startArgs(repo, { title: `Room ${roomId}` }), run)
      return ledger.recordSessionStart(roomId, 'opencode', name, now())
    }
    case 'assign': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const agentId = flag(values, 'agent')
      // The task.assigned reducer rejects an unknown implementer, so the participant MUST
      // exist before assignTask. Register idempotently: re-running assign for the same agent
      // (e.g. a second task) must not duplicate the participant. But the reducer only checks
      // existence, not role — so guard role-awareness here: a same-id participant that isn't an
      // agent implementer must fail loudly, because the ledger has no role-update event to
      // promote it (addParticipant would just throw a confusing "duplicate participant id").
      // Fail fast: assignTask would write an orphan participant.joined event before its
      // reducer rejects an unknown task, and an unknown room throws a cryptic "first event
      // must be room.created" — so verify the room and task exist first.
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      if (!state.tasks.some(t => t.id === taskId))
        throw new Error(`task "${taskId}" not found in room "${roomId}"`)
      const existing = state.participants.find(p => p.id === agentId)
      if (existing !== undefined && (existing.kind !== 'agent' || !existing.roles.includes('implementer')))
        throw new Error(`cannot assign task "${taskId}": participant "${agentId}" already exists without the agent implementer role (the room ledger has no role-update event)`)
      if (existing === undefined)
        await ledger.addParticipant(roomId, { id: agentId, kind: 'agent', roles: ['implementer'], displayName: agentId }, now())
      await ledger.assignTask(roomId, taskId, agentId, now())
      return ledger.setTaskStatus(roomId, taskId, 'in_progress', now())
    }
    case 'validate': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      // Fail fast: the checks are expensive (lint/type-check/test) and recordValidation
      // would reject an unknown task anyway, so verify the task exists first.
      const state = await ledger.getState(roomId)
      if (state === null || !state.tasks.some(t => t.id === taskId))
        throw new Error(`task "${taskId}" not found in room "${roomId}"`)
      const validation = await runValidation(taskId, checks, run, now())
      const recorded = await ledger.recordValidation(roomId, validation, now())
      // Advance only on pass; a failure leaves the status put so escalate can later trigger on it.
      if (validation.status === 'passed')
        return ledger.setTaskStatus(roomId, taskId, 'validated', now())
      return recorded
    }
    case 'escalate': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      // Escalation is conditional: only pull in ÆLLI when a trigger actually fired
      // (failed validation, a rejection, or a block). Otherwise leave the room untouched.
      const decision = shouldEscalate(state, taskId)
      if (!decision.escalate)
        return state
      const request = buildEscalationRequest(state, taskId)
      return recordAelliEscalation(ledger, aelliClient, request, { id: `esc-${roomId}-${taskId}-${now()}`, at: now() })
    }
    case 'skills': {
      const roomId = flag(values, 'room')
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      // Read-only surfacing of the selection — no ledger mutation (no schema change in this
      // slice). `review` is the default stage because that's the gate most runs hit first.
      // Validate against the six concrete stages: 'all' is a skill marker, not a step you're
      // AT (selecting on it returns only 'all'-tagged skills), so reject it like any unknown.
      const stages = ['plan', 'implement', 'review', 'validate', 'escalate', 'deliver'] as const
      const stage = (values.stage as string | undefined) ?? 'review'
      if (!(stages as readonly string[]).includes(stage))
        throw new Error(`unknown stage "${stage}" (expected plan | implement | review | validate | escalate | deliver)`)
      const approved = await loadApprovedSkills(readFile, skillRegistryPath)
      const selected = selectSkills(approved, { stage: stage as Exclude<WorkflowStage, 'all'> })
      console.log(`selected skills (${stage}): ${selected.map(s => s.id).join(', ') || '(none)'}`)
      return state
    }
    case 'review': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const reviewerId = flag(values, 'reviewer')
      // Validate the verdict at the CLI boundary, BEFORE any participant write or the worker
      // runs — an invalid verdict must fail fast rather than dispatch a doomed review.
      const parsedVerdict = ReviewVerdictSchema.safeParse(flag(values, 'verdict'))
      if (!parsedVerdict.success)
        throw new Error(`invalid verdict "${values.verdict}" (expected approved | rejected | changes_requested)`)
      const verdict = parsedVerdict.data
      // Fail fast: registering the reviewer below would write an orphan participant.joined
      // event before dispatchReview's reducer rejects an unknown task, and an unknown room
      // throws a cryptic "first event must be room.created" — so verify both exist first.
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      if (!state.tasks.some(t => t.id === taskId))
        throw new Error(`task "${taskId}" not found in room "${roomId}"`)
      // Register the reviewer idempotently — dispatchReview's canReview gate requires a known
      // participant holding the reviewer role. The ledger has no role-update event, so a same-id
      // participant that isn't an agent reviewer can't be promoted: fail loudly here instead of
      // letting canReview throw a misleading "no self-review" error.
      const existing = state.participants.find(p => p.id === reviewerId)
      if (existing !== undefined && (existing.kind !== 'agent' || !existing.roles.includes('reviewer')))
        throw new Error(`cannot review task "${taskId}": participant "${reviewerId}" already exists without the agent reviewer role (the room ledger has no role-update event)`)
      const participant = existing ?? (await ledger.addParticipant(roomId, { id: reviewerId, kind: 'agent', roles: ['reviewer'], displayName: reviewerId }, now())).participants.find(p => p.id === reviewerId)!
      // Capture the implementer's working-tree diff as the reviewer prompt; '' when no repo given.
      const prompt = values.repo ? await gitDiff(values.repo, run) : ''
      return dispatchReview({
        ledger,
        worker,
        roomId,
        participant,
        taskId,
        prompt,
        reviewId: `rev-${roomId}-${taskId}-${reviewerId}-${now()}`,
        verdict,
        at: now(),
      })
    }
    case 'deliver': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      // Mirror the assign/review/validate preflight: fail fast on an unknown room/task
      // before the merge-readiness gate touches anything.
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      const task = state.tasks.find(t => t.id === taskId)
      if (task === undefined)
        throw new Error(`task "${taskId}" not found in room "${roomId}"`)
      // Gate on doctrine: refuse unless merge-ready, surfacing every unmet reason. Read
      // --branch only past the gate so the refusal path doesn't depend on it.
      const { ready, reasons } = isMergeReady(state, taskId)
      if (!ready)
        throw new Error(`not ready to merge task "${taskId}": ${reasons.join('; ')}`)
      const branch = flag(values, 'branch')
      // Default to 'main' when absent, but reject an explicit empty --base: parseArgs lets
      // `--base ''` through and an empty base would produce a nonsense `gh pr create --base`.
      if (values.base === '')
        throw new Error('--base must not be empty')
      const base = (values.base as string | undefined) ?? 'main'
      const body = generatePullRequestBody(state, taskId)
      const url = await openPullRequestForBranch({ branch, base, title: task.title, body }, run)
      console.log(url)
      return ledger.setTaskStatus(roomId, taskId, 'merged', now())
    }
    case 'status': {
      const roomId = flag(values, 'room')
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      console.log(JSON.stringify(state, null, 2))
      return state
    }
    case 'up': {
      const name = flag(values, 'name')
      const repo = flag(values, 'repo')
      const created = await runCli(['create-room', '--name', name], deps)
      return runCli(['start', '--room', created.room.id, '--repo', repo], deps)
    }
    case 'run-task': {
      // Thin glue: hand the parsed flags to orchestrate, which chains the subcommands via
      // runCli so they stay the single source of truth. --base/--verdict are optional.
      return orchestrate({
        room: flag(values, 'room'),
        task: flag(values, 'task'),
        agent: flag(values, 'agent'),
        reviewer: flag(values, 'reviewer'),
        repo: flag(values, 'repo'),
        branch: flag(values, 'branch'),
        base: values.base as string | undefined,
        verdict: values.verdict as ReviewVerdict | undefined,
      }, deps, runCli)
    }
    default:
      throw new Error(`unknown subcommand: ${subcommand ?? '(none)'} (expected create-room | create-task | start | validate | status | up | assign | escalate | review | skills | deliver | run-task)`)
  }
}

// Entrypoint: only runs when invoked directly, not when imported by tests.
// pathToFileURL handles paths with spaces/special chars that a raw `file://` would not.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2)
  const ledger = new RoomLedger(new FileLedgerStore('.octowiz/ledger'))
  const provider = selectProvider('auto', defaultRun)
  const worker = createLocalModelWorker(defaultRun, { command: process.env.OCTOWIZ_MODEL_CMD ?? 'octowiz-model' })
  // Real ÆLLI seam: one A2A call to the deployed brain when the LiteLLM gateway is configured.
  // Absent config, fail loud on use (don't silently no-op) — escalations must not vanish.
  const aelliBaseUrl = process.env.LITELLM_BASE_URL
  const aelliApiKey = process.env.LITELLM_API_KEY
  const aelliClient: AelliClient = aelliBaseUrl && aelliApiKey
    ? createA2aAelliClient({ baseUrl: aelliBaseUrl, apiKey: aelliApiKey })
    : async () => {
      throw new Error('ÆLLI client not configured: set LITELLM_BASE_URL and LITELLM_API_KEY')
    }
  runCli(argv, {
    ledger,
    run: defaultRun,
    now: () => new Date().toISOString(),
    provider,
    worker,
    aelliClient,
    readFile: defaultReadFile,
    skillRegistryPath: 'skills/registry.json',
    checks: DEFAULT_CHECKS,
  })
    .then((state) => {
      // `status` already printed its projection; for mutating commands, echo the room id
      // so the human has the handle for follow-up commands (status/validate/start).
      if (argv[0] !== 'status')
        console.log(state.room.id)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
