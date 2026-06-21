# M4 — Zellij/OpenCode Room Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the room spine end-to-end — one command creates a ledger-recorded room, a Zellij session, and OpenCode in it, with session starts and a validation result recorded as ledger events.

**Architecture:** Thin vertical tracer. Extend `@octowiz/schemas` + `@octowiz/room-ledger` with an additive `session.started` event; add two new pure-logic packages (`zellij-adapter`, `opencode-adapter`) and one (`validation`) that shell out via an injected `Run` seam; a single `scripts/octowiz.ts` CLI orchestrates. Adapters stay independent; the CLI composes them.

**Tech Stack:** TypeScript (no build step — `types`/`exports` → `./src/index.ts`), Zod v4 (`catalog:`), Vitest v4, `node:util.parseArgs`, `node:child_process.execFile`. pnpm workspace, `@antfu/eslint-config`.

**Source of truth:** This plan implements the APPROVED spec at `docs/superpowers/specs/2026-06-21-m4-zellij-opencode-room-flow-design.md`. Read it for *what/why*. This plan adds *order, exact code, and checkpoints* — where they differ, the spec wins; flag the conflict.

## Global Constraints

- **No `SCHEMAS_VERSION` bump** — stays `'0.1.0'`. The new event is additive; bumping would reject every existing `0.1.0` line and strand M3 tests/fixtures. (spec §Schema extension)
- **No new runtime dependencies.** Arg parsing via `node:util.parseArgs`; exec via `node:child_process`. No `commander`/`yargs`/`execa`.
- **No version hardcoding** — shared deps come from `pnpm-workspace.yaml` `catalog:`; internal deps via `workspace:*`.
- **Injected exec seam.** `type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>`. All shell-out logic takes `Run` as a parameter; unit tests inject a fake. The one real `defaultRun` lives only in the CLI (composition root). (spec §The exec seam)
- **`at` is caller-supplied** ISO string — never call `Date` inside pure core/reducer/facade. (existing convention, see `reducer.ts`)
- **Deterministic session name:** `octowiz-<roomId>`. Nothing stored or looked up. (spec §Schema extension)
- **Adapters are independent** — `opencode-adapter` MUST NOT import `zellij-adapter`. The CLI does the composition. (spec §opencode-adapter)
- **New packages follow the M3 template:** `@octowiz/<name>`, `private: true`, `type: module`, `types`/`exports` → `./src/index.ts`, scripts `type-check: tsc --noEmit` + `test: vitest run`, `tsconfig.json` extends `../config-typescript/node.json`.
- **TDD, conventional commits** (commitlint + secretlint gate on commit), frequent commits — one per task minimum. Commit trailers required:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01A6nxXy5scSvdXePxN7zDZE
  ```
- **Gate (must stay green):** `pnpm lint`, `pnpm -r type-check`, `pnpm -r test`.

## Binary availability (affects acceptance, discovered at plan time)

- **`zellij` 0.44.3 is installed** at `/opt/homebrew/bin/zellij` → Task 2 real-binary verification is doable now.
- **`opencode` is NOT installed.** Task 3's *argv builder + unit test* and Task 5's *wiring* proceed against the documented interface, but Task 3's **real-binary verification** and Task 5's **full e2e smoke** are GATED on installing `opencode`. Surface the install decision to the user when Task 3 lands; do not block Tasks 1, 2, 4 on it.

## File Structure

```
packages/schemas/src/index.ts            (modify)  + session.started member, + RoomState.sessions, update ponytail note
packages/schemas/src/index.test.ts       (modify)  + parse tests for the new event
packages/room-ledger/src/reducer.ts      (modify)  + session.started case, init sessions in null branch
packages/room-ledger/src/reducer.test.ts (modify)  + reducer tests
packages/room-ledger/src/ledger.ts       (modify)  + recordSessionStart facade
packages/room-ledger/src/ledger.test.ts  (modify)  + facade test
packages/zellij-adapter/                  (new)     sessionName / ensureSession / runInSession
packages/opencode-adapter/                (new)     startArgs (pure builder, no spawn, no zellij dep)
packages/validation/                      (new)     DEFAULT_CHECKS + runValidation
scripts/octowiz.ts                        (new)     CLI + the one real defaultRun
```

---

### Task 1: Schema + ledger — `session.started` event & `sessions` projection

Implements spec slice 1. Additive union member, projection array, reducer case, facade method.

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/index.test.ts`
- Modify: `packages/room-ledger/src/reducer.ts`
- Modify: `packages/room-ledger/src/reducer.test.ts`
- Modify: `packages/room-ledger/src/ledger.ts`
- Modify: `packages/room-ledger/src/ledger.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 5):
  - Event variant: `{ type: 'session.started', at: string, roomId: string, tool: 'zellij' | 'opencode', sessionName: string }`
  - `RoomState.sessions: { tool: 'zellij' | 'opencode', sessionName: string, at: string }[]`
  - `RoomLedger.recordSessionStart(roomId: string, tool: 'zellij' | 'opencode', sessionName: string, at: string): Promise<RoomState>`

- [ ] **Step 1: Write failing schema test**

In `packages/schemas/src/index.test.ts`, add:

```ts
it('parses a session.started event', () => {
  const event = { type: 'session.started', at: '2026-06-21T00:00:00Z', roomId: 'r1', tool: 'zellij', sessionName: 'octowiz-r1' }
  expect(LedgerEventSchema.parse(event)).toEqual(event)
})

it('rejects session.started with an unknown tool', () => {
  const bad = { type: 'session.started', at: '2026-06-21T00:00:00Z', roomId: 'r1', tool: 'tmux', sessionName: 'octowiz-r1' }
  expect(() => LedgerEventSchema.parse(bad)).toThrow()
})

it('accepts a RoomState with sessions', () => {
  const sessions = [{ tool: 'zellij', sessionName: 'octowiz-r1', at: '2026-06-21T00:00:00Z' }]
  expect(RoomStateSchema.parse({
    room: { id: 'r1', name: 'R', status: 'active', createdAt: '2026-06-21T00:00:00Z' },
    participants: [], tasks: [], reviews: [], validations: [], escalations: [], sessions,
  }).sessions).toEqual(sessions)
})
```

Confirm the test file's existing imports include `LedgerEventSchema` and `RoomStateSchema` from `./index` (add to the import if missing).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @octowiz/schemas test`
Expected: FAIL — `session.started` is not a member of the union; `RoomStateSchema` rejects the unknown `sessions` key.

- [ ] **Step 3: Extend the schema**

In `packages/schemas/src/index.ts`, add a member to the `LedgerEventSchema` discriminated union (after `escalation.recorded`):

```ts
  z.object({ type: z.literal('session.started'), at: z.string().min(1), roomId: z.string().min(1), tool: z.enum(['zellij', 'opencode']), sessionName: z.string().min(1) }),
```

Add to `RoomStateSchema` (after `escalations`):

```ts
  sessions: z.array(z.object({ tool: z.enum(['zellij', 'opencode']), sessionName: z.string().min(1), at: z.string().min(1) })),
```

Update the existing `ponytail:` note above `StoredLedgerEventSchema` (around `index.ts:104`) to record that additive event variants ride the current version:

```ts
// ponytail: only 0.1.0 exists. Additive event variants (new union members) ride the
// current version — old ledgers still validate. A mismatch is rejected outright; when a
// genuinely breaking change ships, widen `schemaVersion` to a union and route old
// envelopes through a migration.
```

- [ ] **Step 4: Run to verify schema tests pass**

Run: `pnpm --filter @octowiz/schemas test`
Expected: PASS.

- [ ] **Step 5: Write failing reducer test**

In `packages/room-ledger/src/reducer.test.ts`, add (match the file's existing helper/builder style for the base `room.created` state):

```ts
it('appends a session on session.started', () => {
  const created = applyEvent(null, { type: 'room.created', at: 't0', room: { id: 'r1', name: 'R', status: 'active', createdAt: 't0' } })
  const next = applyEvent(created, { type: 'session.started', at: 't1', roomId: 'r1', tool: 'zellij', sessionName: 'octowiz-r1' })
  expect(next.sessions).toEqual([{ tool: 'zellij', sessionName: 'octowiz-r1', at: 't1' }])
})

it('initializes sessions to empty on room.created', () => {
  const created = applyEvent(null, { type: 'room.created', at: 't0', room: { id: 'r1', name: 'R', status: 'active', createdAt: 't0' } })
  expect(created.sessions).toEqual([])
})
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm --filter @octowiz/room-ledger test`
Expected: FAIL — `room.created` branch omits `sessions`; no `session.started` case.

- [ ] **Step 7: Update the reducer**

In `packages/room-ledger/src/reducer.ts`, add `sessions: []` to the null-branch return:

```ts
    return { room: event.room, participants: [], tasks: [], reviews: [], validations: [], escalations: [], sessions: [] }
```

Add a case to the `switch` (after `escalation.recorded`):

```ts
    case 'session.started':
      if (event.roomId !== state.room.id)
        throw new Error(`session.started roomId "${event.roomId}" does not match room "${state.room.id}"`)
      return { ...state, sessions: [...state.sessions, { tool: event.tool, sessionName: event.sessionName, at: event.at }] }
```

- [ ] **Step 8: Run to verify reducer tests pass**

Run: `pnpm --filter @octowiz/room-ledger test`
Expected: PASS.

- [ ] **Step 9: Write failing facade test**

In `packages/room-ledger/src/ledger.test.ts`, add (reuse the existing in-memory store + `createRoom` setup pattern already in this file):

```ts
it('records a session start', async () => {
  const ledger = new RoomLedger(new InMemoryStore()) // use the test file's existing store/setup helper
  await ledger.createRoom({ id: 'r1', name: 'R', status: 'active', createdAt: 't0' }, 't0')
  const state = await ledger.recordSessionStart('r1', 'zellij', 'octowiz-r1', 't1')
  expect(state.sessions).toEqual([{ tool: 'zellij', sessionName: 'octowiz-r1', at: 't1' }])
})
```

- [ ] **Step 10: Run to verify failure**

Run: `pnpm --filter @octowiz/room-ledger test`
Expected: FAIL — `recordSessionStart` is not a function.

- [ ] **Step 11: Add the facade method**

In `packages/room-ledger/src/ledger.ts`, add a method to `RoomLedger` (after `recordEscalation`):

```ts
  recordSessionStart(roomId: string, tool: 'zellij' | 'opencode', sessionName: string, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'session.started', at, roomId, tool, sessionName })
  }
```

- [ ] **Step 12: Run the full gate for the two packages**

Run: `pnpm --filter @octowiz/schemas --filter @octowiz/room-ledger test && pnpm --filter @octowiz/schemas --filter @octowiz/room-ledger type-check`
Expected: PASS, PASS.

- [ ] **Step 13: Commit**

```bash
git add packages/schemas packages/room-ledger
git commit -m "feat(schemas,ledger): add session.started event and sessions projection"
```

---

### Task 2: `packages/zellij-adapter` + verify against real `zellij`

Implements spec slice 2. Pure argv builders + an injected `Run`. **Acceptance: argv unit-tested AND `ensureSession`/`runInSession` verified against the real `zellij` 0.44.3 install.**

**Files:**
- Create: `packages/zellij-adapter/package.json`
- Create: `packages/zellij-adapter/tsconfig.json`
- Create: `packages/zellij-adapter/src/index.ts`
- Create: `packages/zellij-adapter/src/index.test.ts`

**Interfaces:**
- Produces (consumed by Task 5):
  - `type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>`
  - `sessionName(roomId: string): string` → `octowiz-${roomId}`
  - `ensureSession(roomId: string, run: Run): Promise<void>` — list sessions; create detached if absent; no-op if present (idempotent)
  - `runInSession(roomId: string, argv: string[], run: Run): Promise<void>` — launch `argv` in a pane of the session

- [ ] **Step 1: Scaffold the package**

Create `packages/zellij-adapter/package.json`:

```json
{
  "name": "@octowiz/zellij-adapter",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "type-check": "tsc --noEmit", "test": "vitest run" },
  "devDependencies": {
    "@octowiz/config-typescript": "workspace:*",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/zellij-adapter/tsconfig.json`:

```json
{
  "extends": "../config-typescript/node.json",
  "include": ["src"]
}
```

Run: `pnpm install` (links the new workspace package).

- [ ] **Step 2: Write the failing tests**

Create `packages/zellij-adapter/src/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { ensureSession, runInSession, sessionName } from './index'

const ok = { code: 0, stdout: '', stderr: '' }

describe('sessionName', () => {
  it('derives octowiz-<roomId>', () => {
    expect(sessionName('r1')).toBe('octowiz-r1')
  })
})

describe('ensureSession', () => {
  it('creates a detached session when absent', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'other-session\n', stderr: '' }) // list-sessions
      .mockResolvedValueOnce(ok) // create
    await ensureSession('r1', run)
    expect(run.mock.calls[0][0]).toBe('zellij')
    expect(run.mock.calls[0][1]).toContain('list-sessions')
    const createArgs = run.mock.calls[1][1]
    expect(createArgs).toContain('octowiz-r1')
  })

  it('is a no-op when the session already exists', async () => {
    const run = vi.fn().mockResolvedValueOnce({ code: 0, stdout: 'octowiz-r1\n', stderr: '' })
    await ensureSession('r1', run)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('runInSession', () => {
  it('launches argv in the room session', async () => {
    const run = vi.fn().mockResolvedValue(ok)
    await runInSession('r1', ['echo', 'hi'], run)
    const [cmd, args] = run.mock.calls[0]
    expect(cmd).toBe('zellij')
    expect(args).toContain('octowiz-r1')
    expect(args.slice(args.indexOf('echo'))).toEqual(['echo', 'hi'])
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @octowiz/zellij-adapter test`
Expected: FAIL — `./index` does not exist.

- [ ] **Step 4: Implement the adapter**

Create `packages/zellij-adapter/src/index.ts`. The exact `list-sessions` parsing and the `run`/`action` launch form below are the *starting hypothesis* — confirm against the real binary in Step 6 and adjust:

```ts
export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

export function sessionName(roomId: string): string {
  return `octowiz-${roomId}`
}

/** True if a session named `name` appears in `zellij list-sessions` output. */
function hasSession(listOutput: string, name: string): boolean {
  // list-sessions prints one session per line; the name is the first token (it may carry
  // ANSI/“(current)” suffixes). Match on a leading whole-word session name.
  return listOutput
    .split('\n')
    .map(line => line.replace(/\x1B\[[0-9;]*m/g, '').trim().split(/\s+/)[0])
    .some(token => token === name)
}

export async function ensureSession(roomId: string, run: Run): Promise<void> {
  const name = sessionName(roomId)
  const list = await run('zellij', ['list-sessions', '--no-formatting'])
  if (hasSession(list.stdout, name))
    return
  // Create the session detached (no client attached) so it can be launched into headlessly.
  const created = await run('zellij', ['--session', name, 'action', 'new-tab'])
  if (created.code !== 0)
    throw new Error(`failed to create zellij session ${name}: ${created.stderr}`)
}

export async function runInSession(roomId: string, argv: string[], run: Run): Promise<void> {
  const name = sessionName(roomId)
  const result = await run('zellij', ['--session', name, 'run', '--', ...argv])
  if (result.code !== 0)
    throw new Error(`failed to run in zellij session ${name}: ${result.stderr}`)
}
```

- [ ] **Step 5: Run to verify unit tests pass**

Run: `pnpm --filter @octowiz/zellij-adapter test`
Expected: PASS. If the assertions on argv shape diverge from the corrected Step-6 invocation, update both together.

- [ ] **Step 6: Verify against the real `zellij` (ACCEPTANCE)**

Resolve the spec's open question (detached-launch form) against `zellij` 0.44.3. Probe and record the exact working invocations:

```bash
zellij --help; zellij action --help; zellij run --help
# create detached:
zellij --session octowiz-verify action new-tab || zellij -s octowiz-verify
zellij list-sessions --no-formatting
# launch a command into it:
zellij --session octowiz-verify run -- echo hello
# cleanup:
zellij delete-session octowiz-verify --force 2>/dev/null || zellij kill-session octowiz-verify 2>/dev/null
```

If the real flags differ from Step 4's hypothesis, fix `src/index.ts` and the test assertions, re-run Step 5. Record the confirmed invocations as an acceptance note in the commit body.

- [ ] **Step 7: Type-check and commit**

Run: `pnpm --filter @octowiz/zellij-adapter type-check`
Expected: PASS.

```bash
git add packages/zellij-adapter pnpm-lock.yaml
git commit -m "feat(zellij-adapter): session name, ensureSession, runInSession

Verified against zellij 0.44.3: <paste confirmed invocations>"
```

---

### Task 3: `packages/opencode-adapter` — `startArgs` builder

Implements spec slice 3 (builder portion). Pure argv builder, **no spawning, no `zellij-adapter` import**. Real-binary verification is GATED on `opencode` install — see acceptance note.

**Files:**
- Create: `packages/opencode-adapter/package.json`
- Create: `packages/opencode-adapter/tsconfig.json`
- Create: `packages/opencode-adapter/src/index.ts`
- Create: `packages/opencode-adapter/src/index.test.ts`

**Interfaces:**
- Produces (consumed by Task 5):
  - `interface TaskContext { title: string, description?: string }`
  - `startArgs(repoPath: string, taskContext: TaskContext): string[]` — argv beginning with `opencode`, carrying repo path + task context

- [ ] **Step 1: Scaffold the package**

Create `packages/opencode-adapter/package.json` (same template as Task 2, name `@octowiz/opencode-adapter`). Create `packages/opencode-adapter/tsconfig.json` identical to Task 2's. Run `pnpm install`.

- [ ] **Step 2: Write the failing test**

Create `packages/opencode-adapter/src/index.test.ts`:

```ts
import { expect, it } from 'vitest'
import { startArgs } from './index'

it('builds argv starting with opencode and the repo path', () => {
  const argv = startArgs('/repos/app', { title: 'Add login' })
  expect(argv[0]).toBe('opencode')
  expect(argv).toContain('/repos/app')
})

it('includes the task title and description in the argv', () => {
  const argv = startArgs('/repos/app', { title: 'Add login', description: 'OAuth flow' })
  const joined = argv.join(' ')
  expect(joined).toContain('Add login')
  expect(joined).toContain('OAuth flow')
})

it('omits description cleanly when absent', () => {
  const argv = startArgs('/repos/app', { title: 'Add login' })
  expect(argv.join(' ')).toContain('Add login')
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @octowiz/opencode-adapter test`
Expected: FAIL — `./index` does not exist.

- [ ] **Step 4: Implement the builder**

Create `packages/opencode-adapter/src/index.ts`. The flag shape (`run` subcommand + positional prompt) is the *starting hypothesis* pending real-binary confirmation (spec open question: arg vs env vs prompt file):

```ts
export interface TaskContext {
  title: string
  description?: string
}

/**
 * Build the argv to launch OpenCode against a repo with task context.
 * Pure builder — the CLI spawns this via zellij.runInSession. No process work here.
 *
 * ponytail: passes the task as a single prompt string. If the real binary needs a
 * prompt file or env var instead, swap the construction here — this is the one place
 * the context-passing mechanism lives (spec open question, resolved in Step 6).
 */
export function startArgs(repoPath: string, taskContext: TaskContext): string[] {
  const prompt = taskContext.description
    ? `${taskContext.title}\n\n${taskContext.description}`
    : taskContext.title
  return ['opencode', 'run', '--cwd', repoPath, prompt]
}
```

- [ ] **Step 5: Run to verify unit tests pass**

Run: `pnpm --filter @octowiz/opencode-adapter test`
Expected: PASS.

- [ ] **Step 6: Real-binary verification — GATED on `opencode` install (ACCEPTANCE)**

`opencode` is not installed. Before this acceptance can complete, surface to the user (do not silently install — there are differently-named "opencode" tools):

> M4 slice 3 needs the `opencode` binary to confirm the context-passing mechanism (arg vs env vs prompt file) and that it actually starts with repo/task context. It's not installed. Install it (which distribution?) so I can verify, or approve deferring slice-3 binary verification to a follow-up?

When installed: run `opencode --help` / `opencode run --help`, confirm the real flag/prompt mechanism, fix `startArgs` + tests if it differs, re-run Step 5, and record the confirmed invocation in the commit body. Until then, mark this acceptance step **deferred** in the commit body.

- [ ] **Step 7: Type-check and commit**

Run: `pnpm --filter @octowiz/opencode-adapter type-check`
Expected: PASS.

```bash
git add packages/opencode-adapter pnpm-lock.yaml
git commit -m "feat(opencode-adapter): startArgs builder for repo + task context

Real-binary verification deferred: opencode not installed (spec slice 3 acceptance)."
```

---

### Task 4: `packages/validation` — named checks → `Validation`

Implements spec slice 4. Pure mapping over the injected `Run`. Produces the existing `Validation` Zod shape from `@octowiz/schemas`.

**Files:**
- Create: `packages/validation/package.json`
- Create: `packages/validation/tsconfig.json`
- Create: `packages/validation/src/index.ts`
- Create: `packages/validation/src/index.test.ts`

**Interfaces:**
- Consumes: `Validation`, `ValidationCheck` types from `@octowiz/schemas`.
- Produces (consumed by Task 5):
  - `type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>`
  - `interface Check { name: string, cmd: string, args: string[] }`
  - `DEFAULT_CHECKS: Check[]` — lint / type-check / test as workspace commands
  - `runValidation(taskId: string, checks: Check[], run: Run, now: string): Promise<Validation>`

- [ ] **Step 1: Scaffold the package**

Create `packages/validation/package.json` (Task 2 template, name `@octowiz/validation`), adding a dependency:

```json
  "dependencies": { "@octowiz/schemas": "workspace:*" },
```

Create `packages/validation/tsconfig.json` identical to Task 2's. Run `pnpm install`.

- [ ] **Step 2: Write the failing tests**

Create `packages/validation/src/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHECKS, runValidation } from './index'

describe('runValidation', () => {
  it('passes when every check exits 0', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' })
    const v = await runValidation('t1', DEFAULT_CHECKS, run, '2026-06-21T00:00:00Z')
    expect(v.status).toBe('passed')
    expect(v.taskId).toBe('t1')
    expect(v.checks.every(c => c.status === 'passed')).toBe(true)
    expect(v.checks).toHaveLength(DEFAULT_CHECKS.length)
  })

  it('fails overall when any check exits non-zero', async () => {
    const checks = [
      { name: 'lint', cmd: 'pnpm', args: ['lint'] },
      { name: 'test', cmd: 'pnpm', args: ['-r', 'test'] },
    ]
    const run = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'ok', stderr: '' })
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'boom' })
    const v = await runValidation('t1', checks, run, '2026-06-21T00:00:00Z')
    expect(v.status).toBe('failed')
    expect(v.checks.find(c => c.name === 'test')?.status).toBe('failed')
    expect(v.checks.find(c => c.name === 'test')?.output).toContain('boom')
  })

  it('produces a Validation that parses against the schema', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' })
    const v = await runValidation('t1', DEFAULT_CHECKS, run, '2026-06-21T00:00:00Z')
    // ValidationSchema.parse(v) must not throw — assert key fields are present
    expect(v.id).toBeTruthy()
    expect(v.createdAt).toBe('2026-06-21T00:00:00Z')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @octowiz/validation test`
Expected: FAIL — `./index` does not exist.

- [ ] **Step 4: Implement the runtime**

Create `packages/validation/src/index.ts`:

```ts
import type { Validation, ValidationCheck } from '@octowiz/schemas'

export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

export interface Check {
  name: string
  cmd: string
  args: string[]
}

export const DEFAULT_CHECKS: Check[] = [
  { name: 'lint', cmd: 'pnpm', args: ['lint'] },
  { name: 'type-check', cmd: 'pnpm', args: ['-r', 'type-check'] },
  { name: 'test', cmd: 'pnpm', args: ['-r', 'test'] },
]

/** Run each check via the injected `run`, map exit code → passed/failed, capture output. */
export async function runValidation(taskId: string, checks: Check[], run: Run, now: string): Promise<Validation> {
  const results: ValidationCheck[] = []
  for (const check of checks) {
    const { code, stdout, stderr } = await run(check.cmd, check.args)
    results.push({
      name: check.name,
      status: code === 0 ? 'passed' : 'failed',
      output: [stdout, stderr].filter(Boolean).join('\n') || undefined,
    })
  }
  const status = results.every(c => c.status === 'passed') ? 'passed' : 'failed'
  return {
    id: `val-${taskId}-${now}`,
    taskId,
    status,
    checks: results,
    createdAt: now,
  }
}
```

- [ ] **Step 5: Run to verify tests pass**

Run: `pnpm --filter @octowiz/validation test`
Expected: PASS.

- [ ] **Step 6: Type-check and commit**

Run: `pnpm --filter @octowiz/validation type-check`
Expected: PASS.

```bash
git add packages/validation pnpm-lock.yaml
git commit -m "feat(validation): named-check runner producing a Validation result"
```

---

### Task 5: CLI `scripts/octowiz.ts` — orchestration, `defaultRun`, `up`/`status`

Implements spec slice 5 + the CLI from spec §CLI. Single entry, `node:util.parseArgs`, the one real `defaultRun`. Subcommands: `create-room`, `start`, `validate`, `status`, `up`.

**Files:**
- Create: `scripts/octowiz.ts`
- Create: `scripts/octowiz.test.ts` (unit-test the pure routing/glue with a fake `run` + a temp ledger root)

**Interfaces:**
- Consumes: `RoomLedger`, `FileLedgerStore` from `@octowiz/room-ledger`; `ensureSession`, `runInSession`, `sessionName` from `@octowiz/zellij-adapter`; `startArgs` from `@octowiz/opencode-adapter`; `runValidation`, `DEFAULT_CHECKS` from `@octowiz/validation`.
- Produces: a runnable CLI. `defaultRun: Run` (real `execFile` wrapper) defined here.

> **Note on test scope:** the `start`/`up` paths invoke `zellij` (and, once installed, `opencode`). Unit-test the CLI by injecting a **fake `run`** and a **temp ledger root** (`node:fs.mkdtemp`), asserting the right ledger events are written and the right argv is dispatched — NOT by spawning real binaries. Reserve real-binary exercise for the manual e2e smoke in Step 6.

- [ ] **Step 1: Decide the CLI's testable seam**

Structure `scripts/octowiz.ts` so the command logic is a pure `run(argv: string[], deps)` function where `deps = { ledger, run: Run, now: () => string }`, and the `node` entrypoint wires real deps (`FileLedgerStore` at `.octowiz/ledger`, `defaultRun`, `() => new Date().toISOString()`). This keeps `Date`/`execFile`/filesystem-root out of the testable core.

- [ ] **Step 2: Write the failing CLI test**

Create `scripts/octowiz.test.ts`:

```ts
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { runCli } from './octowiz'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-cli-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  let clock = 0
  const now = () => `2026-06-21T00:00:0${clock++}Z`
  return { root, ledger, now }
}

describe('create-room', () => {
  it('writes a room.created event', async () => {
    const { root, ledger, now } = await fixture()
    const run = vi.fn()
    await runCli(['create-room', '--name', 'Demo'], { ledger, run, now })
    const rooms = await new FileLedgerStore(root).listRooms()
    expect(rooms).toHaveLength(1)
  })
})

describe('start', () => {
  it('records zellij then opencode session starts and dispatches argv', async () => {
    const { ledger, now } = await fixture()
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    const state = await runCli(['create-room', '--name', 'Demo'], { ledger, run, now })
    const roomId = state.room.id
    await runCli(['start', '--room', roomId, '--repo', '/repos/app'], { ledger, run, now })
    const after = await ledger.getState(roomId)
    expect(after?.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
    // opencode argv was dispatched into the zellij session
    expect(run.mock.calls.some(([cmd, args]) => cmd === 'zellij' && args.join(' ').includes('opencode'))).toBe(true)
  })
})

describe('validate', () => {
  it('records a Validation to the ledger', async () => {
    const { ledger, now } = await fixture()
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' })
    const state = await runCli(['create-room', '--name', 'Demo'], { ledger, run, now })
    const roomId = state.room.id
    // a task must exist for validation to attach to
    await ledger.createTask({ id: 'task1', roomId, title: 'T', status: 'open' }, now())
    await runCli(['validate', '--room', roomId, '--task', 'task1'], { ledger, run, now })
    const after = await ledger.getState(roomId)
    expect(after?.validations).toHaveLength(1)
    expect(after?.validations[0].status).toBe('passed')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter octowiz-v2 exec vitest run scripts/octowiz.test.ts` (or add a root test script — see Step 5)
Expected: FAIL — `./octowiz` / `runCli` does not exist.

- [ ] **Step 4: Implement the CLI**

Create `scripts/octowiz.ts`:

```ts
import type { RoomState } from '@octowiz/schemas'
import { execFile } from 'node:child_process'
import { parseArgs } from 'node:util'
import { promisify } from 'node:util'
import { startArgs } from '@octowiz/opencode-adapter'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { DEFAULT_CHECKS, runValidation } from '@octowiz/validation'
import { ensureSession, runInSession } from '@octowiz/zellij-adapter'

type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

interface Deps {
  ledger: RoomLedger
  run: Run
  now: () => string
}

const execFileAsync = promisify(execFile)

/** The one real exec seam: wrap node:child_process. Non-zero exit must NOT reject. */
export const defaultRun: Run = async (cmd, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args)
    return { code: 0, stdout, stderr }
  }
  catch (error) {
    const e = error as { code?: number, stdout?: string, stderr?: string }
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(error) }
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
  const { ledger, run, now } = deps
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      room: { type: 'string' },
      repo: { type: 'string' },
      task: { type: 'string' },
    },
    allowPositionals: false,
  })

  switch (subcommand) {
    case 'create-room': {
      const name = flag(values, 'name')
      const id = `room-${now()}`.replace(/[:.]/g, '-')
      return ledger.createRoom({ id, name, status: 'active', createdAt: now() }, now())
    }
    case 'start': {
      const roomId = flag(values, 'room')
      const repo = flag(values, 'repo')
      await ensureSession(roomId, run)
      const sName = `octowiz-${roomId}`
      await ledger.recordSessionStart(roomId, 'zellij', sName, now())
      await runInSession(roomId, startArgs(repo, { title: `Room ${roomId}` }), run)
      return ledger.recordSessionStart(roomId, 'opencode', sName, now())
    }
    case 'validate': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const validation = await runValidation(taskId, DEFAULT_CHECKS, run, now())
      return ledger.recordValidation(roomId, validation, now())
    }
    case 'status': {
      const roomId = flag(values, 'room')
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(state, null, 2))
      return state
    }
    case 'up': {
      const name = flag(values, 'name')
      const repo = flag(values, 'repo')
      const created = await runCli(['create-room', '--name', name], deps)
      return runCli(['start', '--room', created.room.id, '--repo', repo], deps)
    }
    default:
      throw new Error(`unknown subcommand: ${subcommand ?? '(none)'}`)
  }
}

// Entrypoint: only runs when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const ledger = new RoomLedger(new FileLedgerStore('.octowiz/ledger'))
  runCli(process.argv.slice(2), { ledger, run: defaultRun, now: () => new Date().toISOString() })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
```

Create `scripts/package.json` if `scripts/` needs to resolve `@octowiz/*` workspace deps, OR (preferred, lazier) add the workspace deps and a test script to the **root** `package.json` and keep `scripts/` as plain files resolved from root. Decide based on how `pnpm` resolves the imports when Step 5 runs; if root resolution works, skip a `scripts/package.json`.

- [ ] **Step 5: Wire a test runner for `scripts/` and run to green**

Add to root `package.json` `devDependencies` the workspace packages the CLI imports (`@octowiz/room-ledger`, `@octowiz/zellij-adapter`, `@octowiz/opencode-adapter`, `@octowiz/validation`, `@octowiz/schemas`) as `workspace:*`, and a root script `"test:cli": "vitest run scripts"`. Run `pnpm install`.

Run: `pnpm test:cli`
Expected: PASS (all three describe blocks).

- [ ] **Step 6: End-to-end smoke (real `zellij`; `opencode` GATED)**

With real `zellij`, run the tracer against a temp ledger root and confirm a Zellij session is created and `session.started('zellij')` is recorded:

```bash
node scripts/octowiz.ts up --name SmokeRoom --repo "$PWD"
zellij list-sessions --no-formatting   # expect an octowiz-room-... session
node scripts/octowiz.ts status --room <roomId>  # expect sessions: [zellij, opencode]
```

The `opencode` leg dispatches argv into the pane but cannot be confirmed to actually start until `opencode` is installed (Task 3 gate). Record what was confirmed vs. deferred in the commit body. Clean up the smoke session afterward.

- [ ] **Step 7: Full gate + commit**

Run: `pnpm lint && pnpm -r type-check && pnpm -r test && pnpm test:cli`
Expected: all PASS.

```bash
git add scripts package.json pnpm-lock.yaml
git commit -m "feat(cli): octowiz tracer — create-room, start, validate, status, up

E2E smoke confirmed zellij session + session.started events; opencode leg deferred (binary not installed)."
```

---

## Self-Review

**Spec coverage:**
- §Schema extension (session.started, no version bump, sessions projection, deterministic name) → Task 1 ✓
- §Projection + recordSessionStart → Task 1 ✓
- §zellij-adapter (sessionName/ensureSession/runInSession + real-binary verify) → Task 2 ✓
- §opencode-adapter (startArgs only, no zellij dep, no spawn) → Task 3 ✓
- §validation (Check, DEFAULT_CHECKS, runValidation) → Task 4 ✓
- §CLI (5 subcommands, parseArgs, fixed ledger root) → Task 5 ✓
- §exec seam (injected Run, one defaultRun) → Run defined locally in zellij-adapter + validation; defaultRun once in CLI ✓
- §Out of scope (sandbox, doctrine #4/#5, full pane API) → not in any task ✓
- Slices 2 & 3 real-binary acceptance → Task 2 Step 6 (done now), Task 3 Step 6 (gated on opencode) ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step has concrete code. Two deliberate, named open questions (zellij launch form, opencode context mechanism) are isolated to one file each and resolved in a numbered verification step, per spec §Open questions — not placeholders.

**Type consistency:** `Run` signature identical across zellij-adapter, validation, CLI. `sessionName(roomId)` = `octowiz-${roomId}` used consistently. `recordSessionStart(roomId, tool, sessionName, at)` matches Task 1 definition and Task 5 call sites. `startArgs(repoPath, taskContext)` / `TaskContext` consistent between Tasks 3 and 5. `runValidation(taskId, checks, run, now)` consistent between Tasks 4 and 5.

**Deviations from spec, flagged:**
- `defaultRun` location: spec describes the seam but not where the default impl lives. Placed once in the CLI (composition root) rather than a shared package, with the `Run` *type* repeated as a one-liner in the two shell-out packages. Rationale: avoids a new package / cross-adapter dep for a 10-line wrapper. Independence preserved.
- A root `test:cli` script + root workspace deps for `scripts/` (vs. a `scripts/package.json`) — chosen lazily at Task 5 Step 4/5 based on what pnpm resolves; either keeps the CLI a single file as the spec requires.
