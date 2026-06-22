import type { AelliClient } from '@octowiz/aelli-adapter'
import type { AdviceReviewer, AgentWorker } from '@octowiz/agent-runtime'
import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import type { ReviewVerdict, RoomState } from '@octowiz/schemas'
import type { ReadFile, WorkflowStage } from '@octowiz/skill-runtime'
import type { Check } from '@octowiz/validation'
import { execFile } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { buildEscalationRequest, createA2aAelliClient, recordAelliEscalation, shouldEscalate } from '@octowiz/aelli-adapter'
import { createAelliGatewayWorker, createAelliRouterWorker, createLocalModelWorker, dispatchReview, tieredAdvise } from '@octowiz/agent-runtime'
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

// Resolve stable repository paths from this file location so CLI behavior does not depend on
// invocation cwd (e.g. `pnpm --filter @octowiz/cli` vs root-level execution).
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_LEDGER_DIR = join(REPO_ROOT, '.octowiz', 'ledger')
const DEFAULT_SKILL_REGISTRY_PATH = join(REPO_ROOT, 'skills', 'registry.json')

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
  gatewayWorker?: (modelId: string) => AgentWorker
  review?: AdviceReviewer
}

const execFileAsync = promisify(execFile)

/**
 * The one real exec seam: wrap node:child_process. A non-zero exit must NOT reject —
 * execFile rejects on non-zero, so map that back into our { code, stdout, stderr } shape
 * (the adapters/validation decide what a non-zero code means).
 */
export const defaultRun: Run = async (cmd, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd: REPO_ROOT })
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
  const { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks = DEFAULT_CHECKS, gatewayWorker, review } = deps
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
      advisor: { type: 'string' },
      tiers: { type: 'string' },
      prompt: { type: 'string' },
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
      // later milestone; this slice proves the lifecycle depends on the interface. Do not
      // forward the host repo path as container --workdir: without a repo mount that path
      // does not exist in-container and podman create fails.
      const sandbox = await provider.create(roomId)
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
    case 'advise': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const advisorId = flag(values, 'advisor')
      const reviewerId = flag(values, 'reviewer')
      const tiers = flag(values, 'tiers').split(',').map(t => t.trim()).filter(t => t !== '')
      if (tiers.length === 0)
        throw new Error('--tiers must list at least one model id (comma-separated)')
      if (advisorId === reviewerId)
        throw new Error('--advisor and --reviewer must differ (no self-review)')
      if (gatewayWorker === undefined || review === undefined)
        throw new Error('advise requires gatewayWorker and review deps (set LITELLM_BASE_URL + LITELLM_API_KEY)')
      const prompt = (values.prompt as string | undefined) ?? ''
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room \"${roomId}\" not found`)
      if (!state.tasks.some(t => t.id === taskId))
        throw new Error(`task \"${taskId}\" not found in room \"${roomId}\"`)
      const existingAdvisor = state.participants.find(p => p.id === advisorId)
      if (existingAdvisor !== undefined && (existingAdvisor.kind !== 'agent' || !existingAdvisor.roles.includes('advisor')))
        throw new Error(`cannot advise task \"${taskId}\": participant \"${advisorId}\" already exists without the agent advisor role (the room ledger has no role-update event)`)
      if (existingAdvisor === undefined)
        await ledger.addParticipant(roomId, { id: advisorId, kind: 'agent', roles: ['advisor'], displayName: advisorId }, now())
      const existingReviewer = state.participants.find(p => p.id === reviewerId)
      if (existingReviewer !== undefined && (existingReviewer.kind !== 'agent' || !existingReviewer.roles.includes('reviewer')))
        throw new Error(`cannot advise task \"${taskId}\": participant \"${reviewerId}\" already exists without the agent reviewer role (the room ledger has no role-update event)`)
      if (existingReviewer === undefined)
        await ledger.addParticipant(roomId, { id: reviewerId, kind: 'agent', roles: ['reviewer'], displayName: reviewerId }, now())
      const result = await tieredAdvise(
        { roomId, taskId, advisorId, reviewerId, prompt, tiers, at: now() },
        { ledger, gatewayWorker, review },
      )
      console.log(result.status === 'approved' ? `advice approved at tier ${result.tier}` : 'advice escalated (all tiers rejected)')
      const final = await ledger.getState(roomId)
      if (final === null)
        throw new Error(`room \"${roomId}\" not found`)
      return final
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
      throw new Error(`unknown subcommand: ${subcommand ?? '(none)'} (expected create-room | create-task | start | validate | status | up | assign | escalate | review | skills | deliver | run-task | advise)`)
  }
}

// Entrypoint: only runs when invoked directly, not when imported by tests.
// pathToFileURL handles paths with spaces/special chars that a raw `file://` would not.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2)
  const ledger = new RoomLedger(new FileLedgerStore(DEFAULT_LEDGER_DIR))
  const provider = selectProvider('auto', defaultRun)
  // Real ÆLLI seams talk to the deployed brain through the LiteLLM gateway when configured.
  // A2A lives at the gateway ROOT, so strip the `/v1` chat-completions suffix off LITELLM_BASE_URL.
  const aelliGatewayBaseUrl = process.env.LITELLM_BASE_URL
  const aelliBaseUrl = process.env.LITELLM_BASE_URL?.replace(/\/v1\/?$/, '')
  const aelliApiKey = process.env.LITELLM_API_KEY
  // Model worker: route implement/review through ÆLLI's router (generate -> review -> revise
  // with built-in no-self-approval) when configured; else fall back to a local model CLI.
  const worker = aelliBaseUrl && aelliApiKey
    ? createAelliRouterWorker({ baseUrl: aelliBaseUrl, apiKey: aelliApiKey })
    : createLocalModelWorker(defaultRun, { command: process.env.OCTOWIZ_MODEL_CMD ?? 'octowiz-model' })
  // Escalation seam: one A2A call to ÆLLI's orchestrator. Absent config, fail loud on use
  // (don't silently no-op) — escalations must not vanish.
  const aelliClient: AelliClient = aelliBaseUrl && aelliApiKey
    ? createA2aAelliClient({ baseUrl: aelliBaseUrl, apiKey: aelliApiKey })
    : async () => {
      throw new Error('ÆLLI client not configured: set LITELLM_BASE_URL and LITELLM_API_KEY')
    }
  const gatewayWorker = (modelId: string): AgentWorker => {
    if (!aelliGatewayBaseUrl || !aelliApiKey)
      throw new Error('ÆLLI gateway not configured: set LITELLM_BASE_URL and LITELLM_API_KEY')
    return createAelliGatewayWorker(modelId, { baseUrl: aelliGatewayBaseUrl, apiKey: aelliApiKey })
  }
  const reviewerModelId = process.env.OCTOWIZ_REVIEWER_MODEL ?? 'octowiz-reviewer'
  const review: AdviceReviewer = async ({ prompt, candidate }) => {
    const reviewPrompt = `You are an independent reviewer. Task:\n${prompt}\n\nCandidate recommendation:\n${candidate}\n\nReply with exactly one word: approved, rejected, or changes_requested.`
    const out = await gatewayWorker(reviewerModelId)({ role: 'reviewer', prompt: reviewPrompt })
    const parsed = ReviewVerdictSchema.safeParse(out.text.trim().toLowerCase())
    return parsed.success ? parsed.data : 'rejected'
  }
  runCli(argv, {
    ledger,
    run: defaultRun,
    now: () => new Date().toISOString(),
    provider,
    worker,
    aelliClient,
    readFile: defaultReadFile,
    skillRegistryPath: DEFAULT_SKILL_REGISTRY_PATH,
    checks: DEFAULT_CHECKS,
    gatewayWorker,
    review,
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
