# M11 Composition / Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the merged runtime packages into a runnable end-to-end MVP flow at the CLI composition root, proven by one acceptance run that exercises all 10 MVP features together.

**Architecture:** Keep the composition root in `scripts/octowiz.ts`. Extend its `Deps` with the missing injected seams (`worker`, `aelliClient`, `readFile`, `skillRegistryPath`, `checks`). Add discrete subcommands (`assign`, `skills`, `review`, `escalate`, `deliver`) that each call one existing seam and record to the ledger, plus a thin `run-task` (in a new `scripts/orchestrate.ts`) that chains them — mirroring the existing `up` command. Two net-new pure helpers: `selectSkills` (skill-runtime) and `gitDiff` (scripts). Everything else is calling existing, tested seams.

**Tech Stack:** TypeScript (ESM, `node:` builtins), pnpm workspace, vitest, `node:util` `parseArgs`. Existing packages: `@octowiz/{schemas,doctrine,room-ledger,validation,agent-runtime,aelli-adapter,github-adapter,skill-runtime,sandbox-runtime,zellij-adapter,opencode-adapter}`.

## Global Constraints

- **TDD always:** write the failing test first, watch it fail, then the minimal implementation. Each task ends with a commit.
- **Pure core, injected seams:** time (`now`/`at`), ids, and all I/O (`Run`, `AgentWorker`, `AelliClient`, `ReadFile`) are caller-supplied. Never call `Date.now()`, the network, or a real binary in library code.
- **Ledger "latest" = append order**, never `createdAt` (doctrine contract #9). M11 only calls existing reducers — do not reimplement any rule.
- **Conventional commits, lowercase subject.** Commit trailers per repo convention.
- **Full gate green before done:** `pnpm lint`, `pnpm -r type-check`, `pnpm -r test` from the repo root.
- **Code style:** match `scripts/octowiz.ts` — no semicolons, single quotes, 2-space indent, `node:` import prefix, top-of-function comments explaining *why* on non-obvious choices.
- **Out of scope:** real local-model binary, real ÆLLI client, gated real gh/git smoke, real container smoke (item #2); polish nits (item #3). No `@octowiz/schemas` changes (no `pr.opened` event).

---

### Task 1: `selectSkills` pure matcher in skill-runtime

**Files:**
- Create: `packages/skill-runtime/src/skill-selector.ts`
- Modify: `packages/skill-runtime/src/index.ts` (add `export * from './skill-selector'`)
- Test: `packages/skill-runtime/src/skill-selector.test.ts`

**Interfaces:**
- Consumes: `Skill`, `WorkflowStage` from `./skill-registry`.
- Produces:
  - `interface SkillContext { stage: WorkflowStage, role?: string[], taskType?: string[], repoStack?: string[] }`
  - `function selectSkills(skills: Skill[], ctx: SkillContext): Skill[]`

Selection rule: a skill is selected when it is cross-cutting (`workflowStage === 'all'`) **or** its `workflowStage` equals `ctx.stage`, AND it survives trigger narrowing — for each of `role`/`taskType`/`repoStack`, a non-empty declared trigger list requires an intersection with the context signal (an empty declared list, or an absent context signal, does not constrain). Today's registry has empty trigger arrays, so stage match is the operative axis; the narrowing is forward-compatible.

- [ ] **Step 1: Write the failing test**

```typescript
import type { Skill } from './skill-registry'
import { describe, expect, it } from 'vitest'
import { selectSkills } from './skill-selector'

function skill(over: Partial<Skill> & Pick<Skill, 'id' | 'workflowStage'>): Skill {
  return {
    origin: 'native',
    triggers: { taskType: [], repoStack: [], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] },
    ...over,
  }
}

describe('selectSkills', () => {
  it('selects stage-matching skills plus cross-cutting "all" skills', () => {
    const skills = [
      skill({ id: 'code-review', workflowStage: 'review' }),
      skill({ id: 'ledger-recording', workflowStage: 'all' }),
      skill({ id: 'task-planning', workflowStage: 'plan' }),
    ]
    const ids = selectSkills(skills, { stage: 'review' }).map(s => s.id)
    expect(ids).toEqual(['code-review', 'ledger-recording'])
  })

  it('narrows on a non-empty declared trigger when the context supplies that signal', () => {
    const skills = [
      skill({ id: 'code-review', workflowStage: 'review', triggers: { taskType: [], repoStack: ['ts'], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] } }),
      skill({ id: 'adversarial-review', workflowStage: 'review' }),
    ]
    const ids = selectSkills(skills, { stage: 'review', repoStack: ['python'] }).map(s => s.id)
    // code-review declares repoStack:['ts'] but context is python → excluded; adversarial-review unconstrained → kept.
    expect(ids).toEqual(['adversarial-review'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/skill-runtime && pnpm vitest run src/skill-selector.test.ts`
Expected: FAIL — `Cannot find module './skill-selector'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { Skill, WorkflowStage } from './skill-registry'

/**
 * The task context a skill is selected against. `stage` is required (the workflow step in
 * progress); the optional signals narrow the match only when a skill declares them. Mirrors
 * the permissive `SkillTriggers` vocabulary — selection consumes those signals, it does not
 * widen them.
 */
export interface SkillContext {
  stage: WorkflowStage
  role?: string[]
  taskType?: string[]
  repoStack?: string[]
}

// A non-empty declared trigger constrains only when the context supplies that signal: no
// declaration (empty) or no context signal means "does not constrain" — so today's
// all-empty registry selects purely on stage, and future per-skill triggers narrow without
// a code change.
function signalAllows(declared: string[], provided: string[] | undefined): boolean {
  if (declared.length === 0)
    return true
  if (provided === undefined || provided.length === 0)
    return true
  return declared.some(d => provided.includes(d))
}

/**
 * Select the approved skills that apply to a task context: every cross-cutting (`all`) skill
 * plus those whose `workflowStage` matches `ctx.stage`, then narrowed by any declared
 * role/taskType/repoStack triggers. Pure — input order is preserved, no I/O.
 */
export function selectSkills(skills: Skill[], ctx: SkillContext): Skill[] {
  return skills.filter((skill) => {
    if (skill.workflowStage !== 'all' && skill.workflowStage !== ctx.stage)
      return false
    return signalAllows(skill.triggers.role, ctx.role)
      && signalAllows(skill.triggers.taskType, ctx.taskType)
      && signalAllows(skill.triggers.repoStack, ctx.repoStack)
  })
}
```

Then add to `packages/skill-runtime/src/index.ts`:

```typescript
export * from './skill-loader'
export * from './skill-registry'
export * from './skill-selector'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/skill-runtime && pnpm vitest run src/skill-selector.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/skill-runtime/src/skill-selector.ts packages/skill-runtime/src/skill-selector.test.ts packages/skill-runtime/src/index.ts
git commit -m "feat(skill-runtime): add selectSkills trigger/stage matcher"
```

---

### Task 2: `gitDiff` diff-capture helper

**Files:**
- Create: `scripts/git-diff.ts`
- Test: `scripts/git-diff.test.ts`

**Interfaces:**
- Consumes: the `Run` shape `(cmd, args) => Promise<{ code, stdout, stderr }>`.
- Produces: `function gitDiff(workdir: string, run: Run): Promise<string>` — returns the working-tree diff text; throws on a non-zero git exit.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest'
import { gitDiff } from './git-diff'

describe('gitDiff', () => {
  it('runs `git -C <workdir> diff` and returns stdout', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: 'diff --git a/x b/x\n', stderr: '' })
    const out = await gitDiff('/repos/app', run)
    expect(run).toHaveBeenCalledWith('git', ['-C', '/repos/app', 'diff'])
    expect(out).toBe('diff --git a/x b/x\n')
  })

  it('throws with stderr on a non-zero exit', async () => {
    const run = vi.fn().mockResolvedValue({ code: 128, stdout: '', stderr: 'not a git repo' })
    await expect(gitDiff('/nope', run)).rejects.toThrow(/not a git repo/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && pnpm vitest run git-diff.test.ts`
Expected: FAIL — `Cannot find module './git-diff'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

/**
 * Capture the working-tree diff of a sandbox/repo workdir through the injected `Run`, to feed
 * the reviewer prompt. `git -C <workdir>` rather than changing process cwd, so it is safe under
 * concurrency. A non-zero exit throws with the captured stderr (adapter error discipline). In
 * the acceptance run the injected `Run` returns a fixture diff — no real git is invoked.
 */
export async function gitDiff(workdir: string, run: Run): Promise<string> {
  const r = await run('git', ['-C', workdir, 'diff'])
  if (r.code !== 0)
    throw new Error(`git diff in "${workdir}" failed: exit ${r.code}${r.stderr ? `: ${r.stderr}` : ' (no stderr)'}`)
  return r.stdout
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && pnpm vitest run git-diff.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/git-diff.ts scripts/git-diff.test.ts
git commit -m "feat(cli): add gitDiff diff-capture helper for the reviewer prompt"
```

---

### Task 3: Extend `Deps` with the new seams + wire the entrypoint

**Files:**
- Modify: `scripts/package.json` (add workspace dependencies)
- Modify: `scripts/octowiz.ts:13-20` (imports + `Deps`), `scripts/octowiz.ts:51-53` (destructure), `scripts/octowiz.ts:134-149` (entrypoint wiring)
- Modify: `scripts/octowiz.test.ts:9-23` (the `fixture()` helper)

**Interfaces:**
- Produces (the extended `Deps`, relied on by Tasks 4–11):

```typescript
interface Deps {
  ledger: RoomLedger
  run: Run
  now: () => string
  provider: SandboxProvider
  worker: AgentWorker          // reviewer/advisor roles
  aelliClient: AelliClient     // ÆLLI escalation seam
  readFile: ReadFile           // skill registry reader
  skillRegistryPath: string    // path to skills/registry.json
  checks: Check[]              // validation checks (default DEFAULT_CHECKS); injectable so the
                               // acceptance run uses trivial real-pnpm checks, not the monorepo suite
}
```

- [ ] **Step 1: Add workspace dependencies to `scripts/package.json`**

In the `dependencies` block, add (alphabetical, all `workspace:*`):

```json
"@octowiz/agent-runtime": "workspace:*",
"@octowiz/aelli-adapter": "workspace:*",
"@octowiz/doctrine": "workspace:*",
"@octowiz/github-adapter": "workspace:*",
"@octowiz/skill-runtime": "workspace:*",
```

Run: `pnpm install`
Expected: lockfile updates, install succeeds.

- [ ] **Step 2: Write the failing test (extend the fixture, assert new deps flow through)**

Replace the `fixture()` helper in `scripts/octowiz.test.ts` (lines 9-23) with:

```typescript
import type { AelliClient } from '@octowiz/aelli-adapter'
import type { AgentWorker } from '@octowiz/agent-runtime'
import type { ReadFile } from '@octowiz/skill-runtime'
import type { Check } from '@octowiz/validation'
// ...existing imports...

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-cli-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  let clock = 0
  const now = () => `2026-06-21T00:00:${String(clock++).padStart(2, '0')}Z`
  const run = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
  const provider: SandboxProvider = {
    name: 'fake',
    create: async (roomId, _opts) => ({ provider: 'fake', id: `sbx-${roomId}`, roomId }),
    destroy: async () => {},
  }
  // Stub worker: echoes a deterministic verdict text; never touches a model.
  const worker: AgentWorker = async ({ role }) => ({ text: `${role}: looks good` })
  // Stub ÆLLI client: a fixed recommendation; never touches the network.
  const aelliClient: AelliClient = async () => 'aelli: proceed with caution'
  const readFile: ReadFile = async () => JSON.stringify({ schemaVersion: '0.1.0', skills: [] })
  const skillRegistryPath = 'skills/registry.json'
  const checks: Check[] = [{ name: 'noop', cmd: 'true', args: [] }]
  const deps = { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks }
  return { root, ledger, now, run, provider, worker, aelliClient, deps }
}
```

- [ ] **Step 3: Run the suite to verify it fails**

Run: `cd scripts && pnpm vitest run`
Expected: FAIL — `Deps` type errors / `runCli` does not accept the new fields (tsc), or the existing tests fail to type-check.

- [ ] **Step 4: Extend `Deps` and the entrypoint in `scripts/octowiz.ts`**

Add imports near the top (after line 11):

```typescript
import type { AelliClient } from '@octowiz/aelli-adapter'
import type { AgentWorker } from '@octowiz/agent-runtime'
import type { ReadFile } from '@octowiz/skill-runtime'
import type { Check } from '@octowiz/validation'
import { createLocalModelWorker } from '@octowiz/agent-runtime'
import { defaultReadFile } from '@octowiz/skill-runtime'
import { DEFAULT_CHECKS, runValidation } from '@octowiz/validation'
```

(`runValidation` is already imported; keep a single import line — add `Check` and `DEFAULT_CHECKS` is already there.)

Extend the `Deps` interface (lines 15-20):

```typescript
interface Deps {
  ledger: RoomLedger
  run: Run
  now: () => string
  provider: SandboxProvider
  worker: AgentWorker
  aelliClient: AelliClient
  readFile: ReadFile
  skillRegistryPath: string
  checks: Check[]
}
```

Update the destructure in `runCli` (line 53):

```typescript
const { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks } = deps
```

Update the entrypoint wiring (lines 136-138) to supply real constructors:

```typescript
  const ledger = new RoomLedger(new FileLedgerStore('.octowiz/ledger'))
  const provider = selectProvider('auto', defaultRun)
  // The local-model binary is configured via env; the real worker/ÆLLI client are de-faked in
  // item #2. Until then the worker is wired to its real constructor and the ÆLLI client throws
  // if actually invoked, so a production escalate fails loudly rather than silently faking.
  const worker = createLocalModelWorker(defaultRun, { command: process.env.OCTOWIZ_MODEL_CMD ?? 'octowiz-model' })
  const aelliClient: AelliClient = async () => { throw new Error('ÆLLI client not configured (item #2)') }
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
```

- [ ] **Step 5: Run the suite to verify it passes**

Run: `cd scripts && pnpm vitest run`
Expected: PASS — existing tests green with the extended `Deps`.

- [ ] **Step 6: Commit**

```bash
git add scripts/package.json scripts/octowiz.ts scripts/octowiz.test.ts pnpm-lock.yaml
git commit -m "feat(cli): extend Deps with worker, aelliClient, readFile, checks seams"
```

---

### Task 4: `assign` subcommand

**Files:**
- Modify: `scripts/octowiz.ts` (add `agent` option to `parseArgs`; add `case 'assign'`)
- Test: `scripts/octowiz.test.ts`

**Interfaces:**
- Consumes: extended `Deps` (Task 3); `ledger.addParticipant`, `ledger.assignTask`, `ledger.setTaskStatus`.
- Produces: `runCli(['assign', '--room', R, '--task', T, '--agent', A], deps)` → registers `A` as an `agent` participant holding the `implementer` role (idempotent), assigns the task to `A`, and sets the task to `in_progress`.

Note: the `task.assigned` reducer **rejects an unknown implementer participant**, so `assign` must register the participant before assigning.

- [ ] **Step 1: Write the failing test**

```typescript
describe('assign', () => {
  it('registers the implementer, assigns the task, and moves it to in_progress', async () => {
    const { ledger, deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    const state = await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], deps)
    expect(state.participants.map(p => p.id)).toContain('impl-1')
    expect(state.participants.find(p => p.id === 'impl-1')?.roles).toContain('implementer')
    const task = state.tasks.find(t => t.id === taskId)
    expect(task?.implementerId).toBe('impl-1')
    expect(task?.status).toBe('in_progress')
    expect(ledger).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && pnpm vitest run -t assign`
Expected: FAIL — `unknown subcommand: assign`.

- [ ] **Step 3: Add the `agent` option and the `assign` case in `scripts/octowiz.ts`**

Add to the `parseArgs` options object (after `title`):

```typescript
      agent: { type: 'string' },
```

Add a new case before `default:`:

```typescript
    case 'assign': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const agentId = flag(values, 'agent')
      // The task.assigned reducer rejects an unknown implementer, so register the agent as a
      // participant first. Idempotent: skip if already present (the reducer rejects duplicate ids).
      const before = await ledger.getState(roomId)
      if (before === null)
        throw new Error(`room "${roomId}" not found`)
      if (!before.participants.some(p => p.id === agentId)) {
        await ledger.addParticipant(
          roomId,
          { id: agentId, kind: 'agent', roles: ['implementer'], displayName: agentId },
          now(),
        )
      }
      await ledger.assignTask(roomId, taskId, agentId, now())
      return ledger.setTaskStatus(roomId, taskId, 'in_progress', now())
    }
```

Update the `default:` error message to include `assign`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && pnpm vitest run -t assign`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/octowiz.ts scripts/octowiz.test.ts
git commit -m "feat(cli): add assign subcommand (register implementer, assign, in_progress)"
```

---

### Task 5: `validate` advances a passing task to `validated`

**Files:**
- Modify: `scripts/octowiz.ts` (the `case 'validate'` block, lines ~102-112) — use `deps.checks`, and on pass set status to `validated`.
- Test: `scripts/octowiz.test.ts`

**Interfaces:**
- Consumes: `deps.checks`; `ledger.setTaskStatus`.
- Produces: after `validate` of an assigned task whose checks pass, `task.status === 'validated'` (a precondition `isMergeReady` requires). On failure the status is left unchanged so `escalate` can trigger.

- [ ] **Step 1: Write the failing test**

```typescript
describe('validate status', () => {
  it('advances a passing task to validated', async () => {
    const { deps } = await fixture() // checks = [{ name: 'noop', cmd: 'true', args: [] }], run resolves code 0
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], deps)
    const state = await runCli(['validate', '--room', roomId, '--task', taskId], deps)
    expect(state.validations.at(-1)?.status).toBe('passed')
    expect(state.tasks.find(t => t.id === taskId)?.status).toBe('validated')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && pnpm vitest run -t "validate status"`
Expected: FAIL — status is still `in_progress` (current `validate` never advances it), and/or it used `DEFAULT_CHECKS` instead of `deps.checks`.

- [ ] **Step 3: Update the `validate` case in `scripts/octowiz.ts`**

```typescript
    case 'validate': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const state = await ledger.getState(roomId)
      if (state === null || !state.tasks.some(t => t.id === taskId))
        throw new Error(`task "${taskId}" not found in room "${roomId}"`)
      const validation = await runValidation(taskId, checks, run, now())
      const after = await ledger.recordValidation(roomId, validation, now())
      // Advance to `validated` only on a clean pass — `isMergeReady` requires in_review/validated,
      // and leaving a failed task unadvanced is what lets `escalate` fire on it.
      if (validation.status === 'passed')
        return ledger.setTaskStatus(roomId, taskId, 'validated', now())
      return after
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && pnpm vitest run -t "validate status"` then the existing `-t validate` tests.
Expected: PASS. (The existing "records a Validation" test still passes; the "fails fast on unknown task" test still passes — guard is unchanged.)

- [ ] **Step 5: Commit**

```bash
git add scripts/octowiz.ts scripts/octowiz.test.ts
git commit -m "feat(cli): validate uses injected checks and advances passing task to validated"
```

---

### Task 6: `skills` subcommand

**Files:**
- Modify: `scripts/octowiz.ts` (add `stage` option; add `case 'skills'`)
- Test: `scripts/octowiz.test.ts`

**Interfaces:**
- Consumes: `deps.readFile`, `deps.skillRegistryPath`; `loadApprovedSkills`, `selectSkills` from `@octowiz/skill-runtime`.
- Produces: `runCli(['skills', '--room', R, '--task', T, '--stage', S], deps)` loads the approved registry, selects skills for stage `S` (default `review`), prints the selected skill ids, and returns the current `RoomState` (read-only — no ledger mutation, per spec: "prints selection; no schema change").

- [ ] **Step 1: Write the failing test**

```typescript
describe('skills', () => {
  it('selects and prints skills for the stage without mutating the ledger', async () => {
    const { deps } = await fixture()
    // Override readFile with a small registry for this test.
    deps.readFile = async () => JSON.stringify({
      schemaVersion: '0.1.0',
      skills: [
        { id: 'code-review', origin: 'external', workflowStage: 'review', triggers: { taskType: [], repoStack: [], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] } },
        { id: 'task-planning', origin: 'external', workflowStage: 'plan', triggers: { taskType: [], repoStack: [], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] } },
      ],
    })
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const state = await runCli(['skills', '--room', roomId, '--task', 'any', '--stage', 'review'], deps)
    expect(logSpy.mock.calls.flat().join(' ')).toContain('code-review')
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain('task-planning')
    expect(state.reviews).toEqual([]) // no mutation
    logSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && pnpm vitest run -t skills`
Expected: FAIL — `unknown subcommand: skills`.

- [ ] **Step 3: Add the `stage` option and `skills` case**

Add to `parseArgs` options:

```typescript
      stage: { type: 'string' },
```

Add imports:

```typescript
import { loadApprovedSkills, selectSkills } from '@octowiz/skill-runtime'
```

Add the case:

```typescript
    case 'skills': {
      const roomId = flag(values, 'room')
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      // Stage drives selection; default to `review` (the stage the run-task chain selects at).
      const stage = (values.stage as string | undefined) ?? 'review'
      const approved = await loadApprovedSkills(readFile, skillRegistryPath)
      const selected = selectSkills(approved, { stage: stage as Parameters<typeof selectSkills>[1]['stage'] })
      console.log(`selected skills (${stage}): ${selected.map(s => s.id).join(', ') || '(none)'}`)
      return state
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && pnpm vitest run -t skills`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/octowiz.ts scripts/octowiz.test.ts
git commit -m "feat(cli): add skills subcommand (load + select approved skills for a stage)"
```

---

### Task 7: `review` subcommand

**Files:**
- Modify: `scripts/octowiz.ts` (add `reviewer`, `verdict`, `repo` already exists; add `case 'review'`)
- Test: `scripts/octowiz.test.ts`

**Interfaces:**
- Consumes: extended `Deps`; `gitDiff` (Task 2); `dispatchReview` from `@octowiz/agent-runtime`; `ledger.addParticipant`.
- Produces: `runCli(['review', '--room', R, '--task', T, '--reviewer', X, '--verdict', V, '--repo', P], deps)` registers `X` as an `agent` participant holding the `reviewer` role (idempotent), captures the diff from `P` via `gitDiff`, and records the review through `dispatchReview` (which enforces `canReview` no-self-review). `--repo` is optional; if absent the reviewer prompt is the empty string.

Note: `dispatchReview` calls `canReview`, which requires the reviewer to be a registered participant with the `reviewer` role and not the implementer — hence the participant registration here.

- [ ] **Step 1: Write the failing test**

```typescript
describe('review', () => {
  it('registers the reviewer and records an approving review via dispatchReview', async () => {
    const { deps, run } = await fixture()
    run.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'git' && args.includes('diff'))
        return { code: 0, stdout: 'diff --git a/x b/x\n+change\n', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], deps)
    const state = await runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev-1', '--verdict', 'approved', '--repo', '/repos/app'], deps)
    expect(state.participants.find(p => p.id === 'rev-1')?.roles).toContain('reviewer')
    expect(state.reviews).toHaveLength(1)
    expect(state.reviews[0]).toMatchObject({ taskId, reviewerId: 'rev-1', verdict: 'approved' })
  })

  it('refuses a self-review (implementer cannot review own task)', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], deps)
    await expect(
      runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'impl-1', '--verdict', 'approved'], deps),
    ).rejects.toThrow(/no self-review/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && pnpm vitest run -t review`
Expected: FAIL — `unknown subcommand: review`.

- [ ] **Step 3: Add options, imports, and the `review` case**

Add to `parseArgs` options:

```typescript
      reviewer: { type: 'string' },
      verdict: { type: 'string' },
```

Add imports:

```typescript
import type { ReviewVerdict } from '@octowiz/schemas'
import { dispatchReview } from '@octowiz/agent-runtime'
import { gitDiff } from './git-diff'
```

Add the case:

```typescript
    case 'review': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const reviewerId = flag(values, 'reviewer')
      const verdict = flag(values, 'verdict') as ReviewVerdict
      const repo = values.repo as string | undefined
      const before = await ledger.getState(roomId)
      if (before === null)
        throw new Error(`room "${roomId}" not found`)
      // canReview requires the reviewer to be a registered participant with the reviewer role.
      if (!before.participants.some(p => p.id === reviewerId)) {
        await ledger.addParticipant(
          roomId,
          { id: reviewerId, kind: 'agent', roles: ['reviewer'], displayName: reviewerId },
          now(),
        )
      }
      // The reviewer prompt is the implementer's diff; in the acceptance run the injected Run
      // returns a fixture diff. With no repo there is nothing to diff, so the prompt is empty.
      const prompt = repo === undefined ? '' : await gitDiff(repo, run)
      const reviewer = (await ledger.getState(roomId))!.participants.find(p => p.id === reviewerId)!
      return dispatchReview({
        ledger,
        worker,
        roomId,
        participant: reviewer,
        taskId,
        prompt,
        reviewId: `rev-${roomId}-${taskId}-${reviewerId}-${now()}`,
        verdict,
        at: now(),
      })
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && pnpm vitest run -t review`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/octowiz.ts scripts/octowiz.test.ts
git commit -m "feat(cli): add review subcommand (register reviewer, diff prompt, dispatchReview)"
```

---

### Task 8: `escalate` subcommand

**Files:**
- Modify: `scripts/octowiz.ts` (add `case 'escalate'`)
- Test: `scripts/octowiz.test.ts`

**Interfaces:**
- Consumes: `deps.aelliClient`; `shouldEscalate`, `buildEscalationRequest`, `recordAelliEscalation` from `@octowiz/aelli-adapter`.
- Produces: `runCli(['escalate', '--room', R, '--task', T], deps)` — if `shouldEscalate` fires (latest validation failed, a reviewer rejected, or task blocked), records an `escalation.recorded` event carrying the ÆLLI recommendation; otherwise a no-op returning the current state.

- [ ] **Step 1: Write the failing test**

```typescript
describe('escalate', () => {
  it('records an ÆLLI escalation when a review rejected the task', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], deps)
    await runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev-1', '--verdict', 'rejected'], deps)
    const state = await runCli(['escalate', '--room', roomId, '--task', taskId], deps)
    expect(state.escalations).toHaveLength(1)
    expect(state.escalations[0]).toMatchObject({ taskId, reason: 'a review rejected the task', recommendation: 'aelli: proceed with caution' })
  })

  it('is a no-op when nothing triggers escalation', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    const state = await runCli(['escalate', '--room', roomId, '--task', taskId], deps)
    expect(state.escalations).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && pnpm vitest run -t escalate`
Expected: FAIL — `unknown subcommand: escalate`.

- [ ] **Step 3: Add imports and the `escalate` case**

Add imports:

```typescript
import { buildEscalationRequest, recordAelliEscalation, shouldEscalate } from '@octowiz/aelli-adapter'
```

Add the case:

```typescript
    case 'escalate': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      const decision = shouldEscalate(state, taskId)
      if (!decision.escalate)
        return state // nothing triggered — escalation is conditional, not mandatory.
      const request = buildEscalationRequest(state, taskId)
      return recordAelliEscalation(ledger, aelliClient, request, {
        id: `esc-${roomId}-${taskId}-${now()}`,
        at: now(),
      })
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && pnpm vitest run -t escalate`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/octowiz.ts scripts/octowiz.test.ts
git commit -m "feat(cli): add escalate subcommand (shouldEscalate → recordAelliEscalation)"
```

---

### Task 9: `deliver` subcommand

**Files:**
- Modify: `scripts/octowiz.ts` (add `branch`, `base` options; add `case 'deliver'`)
- Test: `scripts/octowiz.test.ts`

**Interfaces:**
- Consumes: `isMergeReady` from `@octowiz/doctrine`; `generatePullRequestBody`, `openPullRequestForBranch` from `@octowiz/github-adapter`.
- Produces: `runCli(['deliver', '--room', R, '--task', T, '--branch', B, '--base', base], deps)` — refuses (throws) unless `isMergeReady`; otherwise generates the PR body, opens the PR via `openPullRequestForBranch` (through `deps.run`), prints the PR URL, and sets the task to `merged`. `--base` defaults to `main`. Returns the current `RoomState`.

- [ ] **Step 1: Write the failing test**

```typescript
describe('deliver', () => {
  it('refuses to deliver a task that is not merge-ready', async () => {
    const { deps } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await expect(
      runCli(['deliver', '--room', roomId, '--task', taskId, '--branch', 'feat/x'], deps),
    ).rejects.toThrow(/not ready to merge/i)
  })

  it('opens a PR for a merge-ready task and records the gh argv', async () => {
    const { deps, run } = await fixture()
    run.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'gh' && args.includes('create'))
        return { code: 0, stdout: 'https://github.com/raelli/octowiz-v2/pull/99\n', stderr: '' }
      if (cmd === 'git' && args.includes('diff'))
        return { code: 0, stdout: 'diff\n', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })
    const created = await runCli(['create-room', '--name', 'Demo'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'T'], deps)
    const taskId = withTask.tasks[0]!.id
    await runCli(['assign', '--room', roomId, '--task', taskId, '--agent', 'impl-1'], deps)
    await runCli(['validate', '--room', roomId, '--task', taskId], deps) // passes → validated
    await runCli(['review', '--room', roomId, '--task', taskId, '--reviewer', 'rev-1', '--verdict', 'approved'], deps)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const state = await runCli(['deliver', '--room', roomId, '--task', taskId, '--branch', 'feat/x', '--base', 'main'], deps)
    const ghCreate = run.mock.calls.find(([cmd, args]: [string, string[]]) => cmd === 'gh' && args.includes('create'))
    expect(ghCreate).toBeDefined()
    expect(logSpy.mock.calls.flat().join(' ')).toContain('pull/99')
    expect(state.tasks.find(t => t.id === taskId)?.status).toBe('merged')
    logSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && pnpm vitest run -t deliver`
Expected: FAIL — `unknown subcommand: deliver`.

- [ ] **Step 3: Add options, imports, and the `deliver` case**

Add to `parseArgs` options:

```typescript
      branch: { type: 'string' },
      base: { type: 'string' },
```

Add imports:

```typescript
import { isMergeReady } from '@octowiz/doctrine'
import { generatePullRequestBody, openPullRequestForBranch } from '@octowiz/github-adapter'
```

Add the case:

```typescript
    case 'deliver': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const branch = flag(values, 'branch')
      const base = (values.base as string | undefined) ?? 'main'
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      // Gate on doctrine — never deliver a task that is not merge-ready. Surface the unmet
      // reasons so the human knows what is missing.
      const readiness = isMergeReady(state, taskId)
      if (!readiness.ready)
        throw new Error(`not ready to merge task "${taskId}": ${readiness.reasons.join('; ')}`)
      const task = state.tasks.find(t => t.id === taskId)!
      const body = generatePullRequestBody(state, taskId)
      const url = await openPullRequestForBranch({ branch, base, title: task.title, body }, run)
      console.log(url)
      return ledger.setTaskStatus(roomId, taskId, 'merged', now())
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && pnpm vitest run -t deliver`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/octowiz.ts scripts/octowiz.test.ts
git commit -m "feat(cli): add deliver subcommand (merge-readiness gate → open PR)"
```

---

### Task 10: `scripts/orchestrate.ts` + `run-task` chain

**Files:**
- Create: `scripts/orchestrate.ts`
- Modify: `scripts/octowiz.ts` (add `case 'run-task'` delegating to `orchestrate`)
- Test: `scripts/orchestrate.test.ts`

**Interfaces:**
- Consumes: `runCli` (re-invoked per step, exactly as `up` does) and the extended `Deps`.
- Produces: `function orchestrate(args: { room: string, task: string, agent: string, reviewer: string, repo: string, branch: string, base?: string, verdict?: ReviewVerdict }, deps: Deps, runCli: RunCli): Promise<RoomState>` where `RunCli = (argv: string[], deps: Deps) => Promise<RoomState>`. It chains: assign → start → validate → skills → review → escalate (always called; no-op unless triggered) → deliver (only when merge-ready; otherwise returns the escalated/unready state).

Chaining via `runCli` keeps each step the single source of truth (DRY) and mirrors `up`.

- [ ] **Step 1: Write the failing test**

```typescript
import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it, vi } from 'vitest'
import { orchestrate } from './orchestrate'
import { runCli } from './octowiz'

async function deps() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-orch-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  let clock = 0
  const now = () => `2026-06-21T00:00:${String(clock++).padStart(2, '0')}Z`
  const run = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === 'gh' && args.includes('create'))
      return { code: 0, stdout: 'https://github.com/raelli/octowiz-v2/pull/1\n', stderr: '' }
    if (cmd === 'git' && args.includes('diff'))
      return { code: 0, stdout: 'diff\n', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  })
  const provider: SandboxProvider = {
    name: 'fake',
    create: async (roomId, _opts) => ({ provider: 'fake', id: `sbx-${roomId}`, roomId }),
    destroy: async () => {},
  }
  return {
    ledger, run, now, provider,
    worker: async ({ role }: { role: string }) => ({ text: `${role}: ok` }),
    aelliClient: async () => 'aelli: proceed',
    readFile: async () => JSON.stringify({ schemaVersion: '0.1.0', skills: [] }),
    skillRegistryPath: 'skills/registry.json',
    checks: [{ name: 'noop', cmd: 'true', args: [] }],
  }
}

describe('run-task happy path', () => {
  it('drives assign → validate → review → deliver and merges the task', async () => {
    const d = await deps()
    const created = await runCli(['create-room', '--name', 'Demo'], d)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'Wire it'], d)
    const taskId = withTask.tasks[0]!.id
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const state = await orchestrate(
      { room: roomId, task: taskId, agent: 'impl-1', reviewer: 'rev-1', repo: '/repos/app', branch: 'feat/x', verdict: 'approved' },
      d, runCli,
    )
    expect(state.tasks.find(t => t.id === taskId)?.status).toBe('merged')
    expect(state.escalations).toEqual([]) // happy path does not escalate
    logSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && pnpm vitest run orchestrate.test.ts`
Expected: FAIL — `Cannot find module './orchestrate'`.

- [ ] **Step 3: Implement `orchestrate` and wire `run-task`**

Create `scripts/orchestrate.ts`:

```typescript
import type { ReviewVerdict, RoomState } from '@octowiz/schemas'

// Structural type matching octowiz.ts's Deps (kept local to avoid exporting Deps just for this).
type Deps = Parameters<typeof import('./octowiz').runCli>[1]
type RunCli = (argv: string[], deps: Deps) => Promise<RoomState>

export interface OrchestrateArgs {
  room: string
  task: string
  agent: string
  reviewer: string
  repo: string
  branch: string
  base?: string
  verdict?: ReviewVerdict
}

/**
 * The thin run-task chain: drive the discrete subcommands in order through `runCli`, exactly as
 * `up` chains create-room + start. Each step remains the single source of truth (DRY). escalate
 * is always invoked but is a no-op unless a trigger fired; deliver runs only when the task is
 * merge-ready, so a rejected/failed task escalates and stops short of a PR.
 */
export async function orchestrate(args: OrchestrateArgs, deps: Deps, runCli: RunCli): Promise<RoomState> {
  const { room, task, agent, reviewer, repo, branch, base = 'main', verdict = 'approved' } = args
  await runCli(['assign', '--room', room, '--task', task, '--agent', agent], deps)
  await runCli(['start', '--room', room, '--repo', repo], deps)
  await runCli(['validate', '--room', room, '--task', task], deps)
  await runCli(['skills', '--room', room, '--task', task, '--stage', 'review'], deps)
  await runCli(['review', '--room', room, '--task', task, '--reviewer', reviewer, '--verdict', verdict, '--repo', repo], deps)
  const escalated = await runCli(['escalate', '--room', room, '--task', task], deps)
  if (escalated.escalations.some(e => e.taskId === task))
    return escalated // a trigger fired — stop before delivery; the human/ÆLLI takes over.
  return runCli(['deliver', '--room', room, '--task', task, '--branch', branch, '--base', base], deps)
}
```

In `scripts/octowiz.ts`, add the import and case:

```typescript
import { orchestrate } from './orchestrate'
```

```typescript
    case 'run-task': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const agentId = flag(values, 'agent')
      const reviewerId = flag(values, 'reviewer')
      const repo = flag(values, 'repo')
      const branch = flag(values, 'branch')
      const base = values.base as string | undefined
      const verdict = values.verdict as ReviewVerdict | undefined
      return orchestrate({ room: roomId, task: taskId, agent: agentId, reviewer: reviewerId, repo, branch, base, verdict }, deps, runCli)
    }
```

Update the `default:` error message to list `run-task`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && pnpm vitest run orchestrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/orchestrate.ts scripts/octowiz.ts scripts/orchestrate.test.ts
git commit -m "feat(cli): add run-task orchestration chaining the composition steps"
```

---

### Task 11: End-to-end acceptance test (all 10 MVP features)

**Files:**
- Create: `scripts/acceptance.e2e.test.ts`
- Create (fixture workspace): `scripts/__fixtures__/validate-workspace/package.json`

**Interfaces:**
- Consumes: `runCli`, `orchestrate`, and `RoomLedger`/`FileLedgerStore` (the same projection the web route uses).
- Produces: a single test file asserting all 10 MVP features — the happy-path `run-task` (features 1–7, 9, 10) plus a focused escalate-on-failure case (feature 8). Validation is **real pnpm** against the fixture workspace; gh/git are recorded; the web proof asserts the ledger projection equals the CLI's final state.

The acceptance `run` dispatches by command: **real `pnpm`** (cwd-bound to the fixture workspace) so validation genuinely shells out; **recording** for `git`/`gh`/`zellij` (asserts argv, returns canned output). `deps.checks` is a single trivial real-pnpm check so validation does not recursively invoke the monorepo suite.

- [ ] **Step 1: Create the fixture workspace**

`scripts/__fixtures__/validate-workspace/package.json`:

```json
{
  "name": "octowiz-validate-fixture",
  "private": true,
  "scripts": {
    "check": "node -e \"process.exit(0)\""
  }
}
```

- [ ] **Step 2: Write the failing acceptance test**

```typescript
import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import { execFile } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it, vi } from 'vitest'
import { orchestrate } from './orchestrate'
import { runCli } from './octowiz'

const execFileAsync = promisify(execFile)
const fixtureWorkspace = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'validate-workspace')

async function acceptanceDeps() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-e2e-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  let clock = 0
  const now = () => `2026-06-21T00:00:${String(clock++).padStart(2, '0')}Z`
  const calls: Array<[string, string[]]> = []
  // Real pnpm for validation (bound to the fixture cwd); recording for everything else.
  const run = async (cmd: string, args: string[]) => {
    calls.push([cmd, args])
    if (cmd === 'pnpm') {
      try {
        const { stdout, stderr } = await execFileAsync('pnpm', args, { cwd: fixtureWorkspace })
        return { code: 0, stdout, stderr }
      }
      catch (e) {
        const err = e as { code?: number, stdout?: string, stderr?: string }
        return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? String(e) }
      }
    }
    if (cmd === 'gh' && args.includes('create'))
      return { code: 0, stdout: 'https://github.com/raelli/octowiz-v2/pull/123\n', stderr: '' }
    if (cmd === 'git' && args.includes('diff'))
      return { code: 0, stdout: 'diff --git a/x b/x\n+real change\n', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }
  const provider: SandboxProvider = {
    name: 'fake',
    create: async (roomId, _opts) => ({ provider: 'fake', id: `sbx-${roomId}`, roomId }),
    destroy: async () => {},
  }
  const deps = {
    ledger, run, now, provider,
    worker: async ({ role }: { role: string }) => ({ text: `${role}: ok` }),
    aelliClient: async () => 'aelli: proceed with caution',
    readFile: async () => JSON.stringify({ schemaVersion: '0.1.0', skills: [
      { id: 'code-review', origin: 'external', workflowStage: 'review', triggers: { taskType: [], repoStack: [], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] } },
      { id: 'ledger-recording', origin: 'native', workflowStage: 'all', triggers: { taskType: [], repoStack: [], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] } },
    ] }),
    skillRegistryPath: 'skills/registry.json',
    checks: [{ name: 'check', cmd: 'pnpm', args: ['run', 'check'] }],
  }
  return { root, ledger, deps, calls }
}

describe('M11 acceptance: all 10 MVP features compose', () => {
  it('drives the full room → assign → validate → review → deliver flow', async () => {
    const { root, ledger, deps, calls } = await acceptanceDeps()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Feature 1: create a room.
    const created = await runCli(['create-room', '--name', 'Acceptance'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'Compose MVP'], deps)
    const taskId = withTask.tasks[0]!.id

    const state = await orchestrate(
      { room: roomId, task: taskId, agent: 'impl-1', reviewer: 'rev-1', repo: '/repos/app', branch: 'feat/m11', verdict: 'approved' },
      deps, runCli,
    )

    // Features 2 & 3: zellij session + opencode launched (recorded sessions + zellij argv).
    expect(state.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
    expect(calls.some(([cmd, args]) => cmd === 'zellij' && args.join(' ').includes('opencode'))).toBe(true)
    // Feature 4: assigned to one agent.
    expect(state.tasks.find(t => t.id === taskId)?.implementerId).toBe('impl-1')
    // Feature 5: task state recorded in the ledger (full lifecycle present).
    expect(state.tasks.find(t => t.id === taskId)?.status).toBe('merged')
    // Feature 6: validation ran via REAL pnpm and passed.
    expect(calls.some(([cmd, args]) => cmd === 'pnpm' && args.join(' ').includes('check'))).toBe(true)
    expect(state.validations.at(-1)?.status).toBe('passed')
    // Feature 7: a separate reviewer (not the implementer) recorded an approval.
    expect(state.reviews[0]).toMatchObject({ reviewerId: 'rev-1', verdict: 'approved' })
    expect(state.reviews[0]!.reviewerId).not.toBe(state.tasks.find(t => t.id === taskId)?.implementerId)
    // Feature 9: a GitHub-ready PR was opened (gh create argv recorded + URL printed).
    expect(calls.some(([cmd, args]) => cmd === 'gh' && args.includes('create'))).toBe(true)
    expect(logSpy.mock.calls.flat().join(' ')).toContain('pull/123')

    // Feature 10: the web server route reads the SAME ledger projection (no Nuxt boot needed —
    // the route is a thin wrapper over RoomLedger.getState over the same dir).
    const cliStatus = await runCli(['status', '--room', roomId], deps)
    const webProjection = await new RoomLedger(new FileLedgerStore(root)).getState(roomId)
    expect(webProjection).toEqual(cliStatus)

    logSpy.mockRestore()
  })

  it('Feature 8: escalates to ÆLLI when a review rejects the task (run-task stops before delivery)', async () => {
    const { deps } = await acceptanceDeps()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const created = await runCli(['create-room', '--name', 'Escalation'], deps)
    const roomId = created.room.id
    const withTask = await runCli(['create-task', '--room', roomId, '--title', 'Risky'], deps)
    const taskId = withTask.tasks[0]!.id
    const state = await orchestrate(
      { room: roomId, task: taskId, agent: 'impl-1', reviewer: 'rev-1', repo: '/repos/app', branch: 'feat/x', verdict: 'rejected' },
      deps, runCli,
    )
    expect(state.escalations).toHaveLength(1)
    expect(state.escalations[0]).toMatchObject({ taskId, recommendation: 'aelli: proceed with caution' })
    expect(state.tasks.find(t => t.id === taskId)?.status).not.toBe('merged') // never delivered
    logSpy.mockRestore()
  })
})
```

- [ ] **Step 3: Run the acceptance test to verify it fails first, then passes**

Run: `cd scripts && pnpm vitest run acceptance.e2e.test.ts`
Expected initially: may FAIL if any earlier task is incomplete. Once Tasks 1–10 are done, expected: PASS (2 tests). If `pnpm run check` errors in the fixture, confirm pnpm is on PATH and the fixture `package.json` is valid.

- [ ] **Step 4: Run the full gate**

Run from repo root:
```bash
pnpm lint && pnpm -r type-check && pnpm -r test
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/acceptance.e2e.test.ts scripts/__fixtures__/validate-workspace/package.json
git commit -m "test(cli): e2e acceptance proving all 10 MVP features compose"
```

---

## Self-Review

**1. Spec coverage:**
- Composition root + `Deps` extension → Task 3. ✅
- `scripts/orchestrate.ts` + `run-task` → Task 10. ✅
- Subcommands assign/skills/review/escalate/deliver → Tasks 4, 6, 7, 8, 9. ✅
- `selectSkills` → Task 1; `gitDiff` → Task 2. ✅
- Real validation + fixtures/stubs at boundaries → Task 11 (dispatching `run`, injected `checks`). ✅
- All 10 MVP features proven together → Task 11 (happy path 1–7,9,10; escalate 8). ✅
- Gates: no-self-review (Task 7), merge-readiness (Task 9), fail-closed escalation (Task 8), append-order contract (no reducer changes). ✅
- Status lifecycle (`in_progress` → `validated` → `merged`) → Tasks 4, 5, 9. ✅
- Out of scope (item #2 de-faking, item #3 polish, no schema change) → respected; entrypoint ÆLLI client throws until de-faked. ✅

**2. Placeholder scan:** No TBD/TODO; every step has complete code and an exact command. ✅

**3. Type consistency:**
- `Deps` fields (`worker`, `aelliClient`, `readFile`, `skillRegistryPath`, `checks`) defined in Task 3 and used identically in Tasks 4–11. ✅
- `selectSkills(skills, ctx)` signature consistent between Task 1 and its use in Task 6. ✅
- `gitDiff(workdir, run)` consistent between Task 2 and Task 7. ✅
- `orchestrate(args, deps, runCli)` consistent between Task 10 definition and the `run-task` case. ✅
- `dispatchReview`/`recordAelliEscalation`/`openPullRequestForBranch`/`isMergeReady`/`generatePullRequestBody` used with their real signatures (verified against source). ✅

One watch-item for the implementer: `Deps` is currently a non-exported interface in `scripts/octowiz.ts`. Task 10's `orchestrate.ts` derives it via `Parameters<typeof runCli>[1]` to avoid exporting it. If the deriving type proves awkward, export `Deps` from `octowiz.ts` and import it in `orchestrate.ts` — either is fine; do not duplicate the interface.

## Execution Handoff

(Plan saved — execution options presented after the plan is committed.)
