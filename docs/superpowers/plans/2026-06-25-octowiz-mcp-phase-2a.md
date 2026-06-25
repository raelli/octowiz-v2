# octowiz-mcp Phase 2a — Local Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps/octowiz-mcp` — a stdio MCP server opencode spawns per session — exposing octowiz's room/ledger/doctrine/validation as native tools, with per-repo auto-room binding and fail-open robustness. No network (ÆLLI A2A is Phase 2b).

**Architecture:** A composition-root app that wires the existing seam-driven `@octowiz/*` packages behind the Model Context Protocol. Room is resolved from MCP `roots` (cwd/git fallback) and auto-created at `<repoRoot>/.octowiz/ledger`. Every tool handler is wrapped fail-open so a tool error never crashes the server or breaks opencode.

**Tech Stack:** TypeScript (raw source, run via `tsx` — no bundler), `@modelcontextprotocol/sdk`, `zod`, `vitest`, pnpm workspace (`workspace:*`), Node LTS.

## Global Constraints

- Package name `@octowiz/mcp`; internal deps via `"workspace:*"`; tsconfig `extends` `../../packages/config-typescript/node.json`. (verbatim repo convention)
- No bundler / no build step — packages export `./src/index.ts`; the server is launched with `tsx`. (verbatim repo convention)
- `at` timestamps come from an injected `now()` seam (default `() => new Date().toISOString()`) so handlers stay testable. (mirrors CLI's caller-supplied `at`)
- Single-writer-per-room: one opencode session per repo checkout. (ledger precondition)
- Fail-open: a tool error returns `{ isError: true, content:[{type:"text",text}] }`; the server process never exits on a tool failure. (spec robustness)
- Ledger path: `<repoRoot>/.octowiz/ledger` (matches CLI `DEFAULT_LEDGER_DIR` and existing `.octowiz/` dirs). (verbatim)
- All code edits happen in a git worktree off a feature branch; never commit to `main`. (user rule: merges gated)

---

### Task 1: Scaffold the `@octowiz/mcp` app + a server that starts and lists tools

**Files:**
- Create: `apps/octowiz-mcp/package.json`
- Create: `apps/octowiz-mcp/tsconfig.json`
- Create: `apps/octowiz-mcp/src/index.ts`
- Create: `apps/octowiz-mcp/src/server.ts`
- Create: `apps/octowiz-mcp/src/server.test.ts`
- Modify: root `pnpm-workspace.yaml` already globs `apps/*` (no change needed — verify)

**Interfaces:**
- Produces: `createServer(deps: ServerDeps): McpServer` and `ServerDeps` (defined here, consumed by every later task).

- [ ] **Step 1: Create the package manifest**

`apps/octowiz-mcp/package.json`:
```json
{
  "name": "@octowiz/mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "octowiz-mcp": "./src/index.ts" },
  "scripts": {
    "start": "tsx src/index.ts",
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.0",
    "@octowiz/schemas": "workspace:*",
    "@octowiz/room-ledger": "workspace:*",
    "@octowiz/doctrine": "workspace:*",
    "@octowiz/validation": "workspace:*",
    "@octowiz/skill-runtime": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@octowiz/config-typescript": "workspace:*",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```
> Pin `zod`/`typescript`/`vitest`/`tsx` to whatever the repo root already uses — run `cat ../../package.json` and match the existing versions instead of these floors if they differ.

- [ ] **Step 2: Create tsconfig**

`apps/octowiz-mcp/tsconfig.json`:
```json
{
  "extends": "../../packages/config-typescript/node.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Install**

Run: `cd /Users/razu/Projects/octowiz-v2 && pnpm install`
Expected: adds `@modelcontextprotocol/sdk`, links `@octowiz/mcp` into the workspace. No errors.

- [ ] **Step 4: Write the failing test**

`apps/octowiz-mcp/src/server.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createServer, type ServerDeps } from './server.js'

function fakeDeps(): ServerDeps {
  return {
    ledgerDirFor: async () => '/tmp/nonexistent/.octowiz/ledger',
    listRoots: undefined,
    cwd: '/tmp/nonexistent',
    now: () => '2026-06-25T00:00:00.000Z',
  }
}

describe('createServer', () => {
  it('constructs an McpServer without throwing', () => {
    const server = createServer(fakeDeps())
    expect(server).toBeDefined()
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd apps/octowiz-mcp && pnpm vitest run src/server.test.ts`
Expected: FAIL — `Cannot find module './server.js'`.

- [ ] **Step 6: Write minimal server**

`apps/octowiz-mcp/src/server.ts`:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface ServerDeps {
  /** Resolve the ledger directory for the active repo (caches internally). */
  ledgerDirFor: () => Promise<string>
  /** MCP client roots accessor, if the client supports it. */
  listRoots?: () => Promise<{ roots: { uri: string, name?: string }[] }>
  /** Process working directory (fallback for repo resolution). */
  cwd: string
  /** Injected clock. */
  now: () => string
}

export function createServer(_deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'octowiz', version: '0.1.0' })
  // tools registered in later tasks
  return server
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run src/server.test.ts`
Expected: PASS.

- [ ] **Step 8: Create the stdio entrypoint**

`apps/octowiz-mcp/src/index.ts`:
```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer, type ServerDeps } from './server.js'
import { makeLedgerResolver } from './room.js'

const server = createServer(buildDeps())
const transport = new StdioServerTransport()
await server.connect(transport)

function buildDeps(): ServerDeps {
  const cwd = process.cwd()
  const now = () => new Date().toISOString()
  // listRoots is wired from the connected server in Task 3's integration step.
  const ledgerDirFor = makeLedgerResolver({ listRoots: undefined, cwd })
  return { ledgerDirFor, listRoots: undefined, cwd, now }
}
```
> `makeLedgerResolver` is created in Task 3; this file won't type-check until then. That's expected — Task 3 closes the loop.

- [ ] **Step 9: Commit**

```bash
git add apps/octowiz-mcp/package.json apps/octowiz-mcp/tsconfig.json apps/octowiz-mcp/src/server.ts apps/octowiz-mcp/src/server.test.ts pnpm-lock.yaml
git commit -m "feat(octowiz-mcp): scaffold MCP app + server skeleton"
```

---

### Task 2: `Run` seam + `defaultRun`

**Files:**
- Create: `apps/octowiz-mcp/src/run.ts`
- Create: `apps/octowiz-mcp/src/run.test.ts`

**Interfaces:**
- Produces: `type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>` and `defaultRun: Run`. (matches `@octowiz/validation`'s `Run` exactly so it plugs into `runValidation`.)

- [ ] **Step 1: Write the failing test**

`apps/octowiz-mcp/src/run.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { defaultRun } from './run.js'

describe('defaultRun', () => {
  it('captures stdout and code 0 on success', async () => {
    const r = await defaultRun('node', ['-e', 'process.stdout.write("hi")'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('hi')
  })

  it('returns non-zero code instead of throwing on failure', async () => {
    const r = await defaultRun('node', ['-e', 'process.exit(3)'])
    expect(r.code).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/run.test.ts`
Expected: FAIL — `Cannot find module './run.js'`.

- [ ] **Step 3: Implement (mirrors scripts/octowiz.ts `defaultRun`)**

`apps/octowiz-mcp/src/run.ts`:
```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/run.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/octowiz-mcp/src/run.ts apps/octowiz-mcp/src/run.test.ts
git commit -m "feat(octowiz-mcp): add Run seam + defaultRun"
```

---

### Task 3: Repo-root resolution (`roots` → git → cwd) + ledger-dir resolver

**Files:**
- Create: `apps/octowiz-mcp/src/room.ts`
- Create: `apps/octowiz-mcp/src/room.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `resolveRepoRoot(listRoots: ListRoots | undefined, cwd: string): Promise<string>`
  - `type ListRoots = () => Promise<{ roots: { uri: string, name?: string }[] }>`
  - `makeLedgerResolver(opts: { listRoots?: ListRoots, cwd: string }): () => Promise<string>` (memoizes after first success)

- [ ] **Step 1: Write the failing test**

`apps/octowiz-mcp/src/room.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { resolveRepoRoot } from './room.js'

describe('resolveRepoRoot', () => {
  it('prefers the first file:// MCP root', async () => {
    const listRoots = async () => ({ roots: [{ uri: 'file:///work/repo', name: 'repo' }] })
    expect(await resolveRepoRoot(listRoots, '/somewhere/else')).toBe('/work/repo')
  })

  it('falls back to cwd when no roots and git is unavailable', async () => {
    const listRoots = async () => ({ roots: [] })
    // /tmp is not a git repo -> git rev-parse fails -> cwd
    const root = await resolveRepoRoot(listRoots, '/tmp')
    expect(root).toBe('/tmp')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/room.test.ts`
Expected: FAIL — `Cannot find module './room.js'`.

- [ ] **Step 3: Implement**

`apps/octowiz-mcp/src/room.ts`:
```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

export type ListRoots = () => Promise<{ roots: { uri: string, name?: string }[] }>

/** Resolve the repo root: MCP roots (switch-safe) → git toplevel from cwd → cwd. */
export async function resolveRepoRoot(listRoots: ListRoots | undefined, cwd: string): Promise<string> {
  if (listRoots) {
    try {
      const { roots } = await listRoots()
      const first = roots.find(r => r.uri.startsWith('file://'))
      if (first) return fileURLToPath(first.uri)
    }
    catch { /* fall through to git/cwd */ }
  }
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd })
    const top = stdout.trim()
    if (top) return top
  }
  catch { /* not a git repo */ }
  return cwd
}

export function makeLedgerResolver(opts: { listRoots?: ListRoots, cwd: string }): () => Promise<string> {
  let cached: string | undefined
  return async () => {
    if (cached) return cached
    const root = await resolveRepoRoot(opts.listRoots, opts.cwd)
    cached = join(root, '.octowiz', 'ledger')
    return cached
  }
}
```
> Memoization is per-process (one repo per session). Re-resolution on `roots/list_changed` is deferred — note it as a `ponytail:` comment: `// ponytail: cache repo root for the session; re-resolve on roots/list_changed when multi-project-per-session matters`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/room.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check the entrypoint loop (Task 1 Step 8 now resolves)**

Run: `pnpm type-check`
Expected: PASS — `index.ts`'s `makeLedgerResolver` import resolves.

- [ ] **Step 6: Commit**

```bash
git add apps/octowiz-mcp/src/room.ts apps/octowiz-mcp/src/room.test.ts
git commit -m "feat(octowiz-mcp): repo-root resolution via MCP roots with git/cwd fallback"
```

---

### Task 4: `ensureRoom` — per-repo auto-room with `room.json` pointer

**Files:**
- Modify: `apps/octowiz-mcp/src/room.ts`
- Modify: `apps/octowiz-mcp/src/room.test.ts`

**Interfaces:**
- Consumes: `RoomLedger`, `FileLedgerStore` from `@octowiz/room-ledger`.
- Produces: `ensureRoom(ledger: RoomLedger, repoRoot: string, now: () => string): Promise<string>` (returns roomId; creates room + opencode participant + session-start on first call).

- [ ] **Step 1: Write the failing test**

Append to `apps/octowiz-mcp/src/room.test.ts`:
```typescript
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoomLedger, FileLedgerStore } from '@octowiz/room-ledger'
import { ensureRoom } from './room.js'

describe('ensureRoom', () => {
  it('creates a room + opencode participant on first call and reuses it after', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'octowiz-room-'))
    const ledger = new RoomLedger(new FileLedgerStore(join(repoRoot, '.octowiz', 'ledger')))
    const now = () => '2026-06-25T01:02:03.456Z'

    const id1 = await ensureRoom(ledger, repoRoot, now)
    const id2 = await ensureRoom(ledger, repoRoot, now)
    expect(id1).toBe(id2)

    const state = await ledger.getState(id1)
    expect(state?.participants.some(p => p.id === 'opencode')).toBe(true)

    const pointer = JSON.parse(await readFile(join(repoRoot, '.octowiz', 'room.json'), 'utf8'))
    expect(pointer.roomId).toBe(id1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/room.test.ts`
Expected: FAIL — `ensureRoom` not exported.

- [ ] **Step 3: Implement**

Append to `apps/octowiz-mcp/src/room.ts`:
```typescript
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import type { RoomLedger } from '@octowiz/room-ledger'

export async function ensureRoom(ledger: RoomLedger, repoRoot: string, now: () => string): Promise<string> {
  const pointer = join(repoRoot, '.octowiz', 'room.json')
  try {
    const { roomId } = JSON.parse(await readFile(pointer, 'utf8')) as { roomId?: string }
    if (roomId && await ledger.getState(roomId)) return roomId
  }
  catch { /* no pointer yet, or stale -> recreate */ }

  const at = now()
  const id = `r${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
  await ledger.createRoom({ id, name: basename(repoRoot), status: 'active', createdAt: at }, at)
  await ledger.addParticipant(id, { id: 'opencode', kind: 'agent', roles: ['advisor'], displayName: 'opencode session' }, at)
  await ledger.recordSessionStart(id, 'opencode', `octowiz-${id}`, at)

  await mkdir(dirname(pointer), { recursive: true })
  await writeFile(pointer, `${JSON.stringify({ roomId: id }, null, 2)}\n`)
  return id
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/room.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/octowiz-mcp/src/room.ts apps/octowiz-mcp/src/room.test.ts
git commit -m "feat(octowiz-mcp): ensureRoom auto-creates a per-repo room with a pointer"
```

---

### Task 5: Context resolver + fail-open tool wrapper

**Files:**
- Create: `apps/octowiz-mcp/src/context.ts`
- Create: `apps/octowiz-mcp/src/context.test.ts`

**Interfaces:**
- Consumes: `makeLedgerResolver`, `ensureRoom`, `RoomLedger`, `FileLedgerStore`.
- Produces:
  - `type Ctx = { ledger: RoomLedger, roomId: string }`
  - `makeContext(deps: ServerDeps): () => Promise<Ctx>` (resolves ledger dir, builds `RoomLedger`, ensures room; memoized)
  - `okText(text: string): ToolResult` / `errText(message: string): ToolResult` / `type ToolResult = { content: { type: 'text', text: string }[], isError?: boolean }`
  - `failOpen<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult>` (catches throws → `errText`)

- [ ] **Step 1: Write the failing test**

`apps/octowiz-mcp/src/context.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { failOpen, okText } from './context.js'

describe('failOpen', () => {
  it('returns the wrapped result on success', async () => {
    const wrapped = failOpen(async () => okText('done'))
    const r = await wrapped({})
    expect(r.isError).toBeFalsy()
    expect(r.content[0].text).toBe('done')
  })

  it('converts a thrown error into an isError text result, never throws', async () => {
    const wrapped = failOpen(async () => { throw new Error('boom') })
    const r = await wrapped({})
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('boom')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/octowiz-mcp/src/context.ts`:
```typescript
import { RoomLedger, FileLedgerStore } from '@octowiz/room-ledger'
import type { ServerDeps } from './server.js'
import { ensureRoom } from './room.js'

export interface Ctx { ledger: RoomLedger, roomId: string }
export type ToolResult = { content: { type: 'text', text: string }[], isError?: boolean }

export function okText(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

export function errText(message: string): ToolResult {
  return { content: [{ type: 'text', text: `octowiz: ${message}` }], isError: true }
}

/** Wrap a handler so any throw becomes a readable isError result — the server stays alive. */
export function failOpen<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args)
    }
    catch (error) {
      return errText(error instanceof Error ? error.message : String(error))
    }
  }
}

export function makeContext(deps: ServerDeps): () => Promise<Ctx> {
  let cached: Ctx | undefined
  return async () => {
    if (cached) return cached
    const ledgerDir = await deps.ledgerDirFor()
    const ledger = new RoomLedger(new FileLedgerStore(ledgerDir))
    // repoRoot for ensureRoom = parent of `<root>/.octowiz/ledger`
    const repoRoot = ledgerDir.replace(/\/\.octowiz\/ledger$/, '')
    const roomId = await ensureRoom(ledger, repoRoot, deps.now)
    cached = { ledger, roomId }
    return cached
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/octowiz-mcp/src/context.ts apps/octowiz-mcp/src/context.test.ts
git commit -m "feat(octowiz-mcp): context resolver + fail-open tool wrapper"
```

---

### Task 6: Tool `octowiz_room_status`

**Files:**
- Create: `apps/octowiz-mcp/src/tools.ts`
- Create: `apps/octowiz-mcp/src/tools.test.ts`

**Interfaces:**
- Consumes: `Ctx`, `okText`, `failOpen` from `context.ts`.
- Produces: `registerTools(server: McpServer, getCtx: () => Promise<Ctx>): void` (this task registers the first tool; later tasks extend the same function).

- [ ] **Step 1: Write the failing test**

`apps/octowiz-mcp/src/tools.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoomLedger, FileLedgerStore } from '@octowiz/room-ledger'
import { roomStatusHandler } from './tools.js'

async function fixtureCtx() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-tools-'))
  const ledger = new RoomLedger(new FileLedgerStore(join(root, '.octowiz', 'ledger')))
  const at = '2026-06-25T00:00:00.000Z'
  await ledger.createRoom({ id: 'r1', name: 'demo', status: 'active', createdAt: at }, at)
  return { ledger, roomId: 'r1' }
}

describe('octowiz_room_status', () => {
  it('returns the current room state as JSON text', async () => {
    const ctx = await fixtureCtx()
    const r = await roomStatusHandler(async () => ctx)
    expect(r.isError).toBeFalsy()
    const state = JSON.parse(r.content[0].text)
    expect(state.room.id).toBe('r1')
    expect(state.room.name).toBe('demo')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler + registration**

`apps/octowiz-mcp/src/tools.ts`:
```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type Ctx, type ToolResult, okText, errText, failOpen } from './context.js'

export async function roomStatusHandler(getCtx: () => Promise<Ctx>): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const state = await ledger.getState(roomId)
  if (!state) return errText(`room ${roomId} not found`)
  return okText(JSON.stringify(state, null, 2))
}

export function registerTools(server: McpServer, getCtx: () => Promise<Ctx>): void {
  server.registerTool(
    'octowiz_room_status',
    {
      description: 'Current octowiz room state for this repo: participants, tasks, reviews, validations, escalations.',
      inputSchema: {},
    },
    failOpen(async () => roomStatusHandler(getCtx)),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/octowiz-mcp/src/tools.ts apps/octowiz-mcp/src/tools.test.ts
git commit -m "feat(octowiz-mcp): octowiz_room_status tool"
```

---

### Task 7: Tool `octowiz_record` (milestone events)

**Files:**
- Modify: `apps/octowiz-mcp/src/tools.ts`
- Modify: `apps/octowiz-mcp/src/tools.test.ts`

**Interfaces:**
- Produces: `recordHandler(getCtx, now, args)` where `args` is the discriminated milestone payload below. Registered as `octowiz_record`.

Supported milestone kinds (subset that the model records intentionally): `task_created`, `task_status`, `review`, `action`. (Validation/escalation get their own dedicated tools — Tasks 8 & 2b.)

- [ ] **Step 1: Write the failing test**

Append to `apps/octowiz-mcp/src/tools.test.ts`:
```typescript
import { recordHandler } from './tools.js'

describe('octowiz_record', () => {
  it('records a task_created event', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:01:00.000Z'
    const r = await recordHandler(async () => ctx, now, {
      kind: 'task_created', title: 'wire mcp', description: 'expose tools',
    })
    expect(r.isError).toBeFalsy()
    const state = await ctx.ledger.getState('r1')
    expect(state?.tasks.at(-1)?.title).toBe('wire mcp')
  })

  it('records an action milestone tied to a task', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:02:00.000Z'
    await recordHandler(async () => ctx, now, { kind: 'task_created', title: 't' })
    const state0 = await ctx.ledger.getState('r1')
    const taskId = state0!.tasks.at(-1)!.id
    const r = await recordHandler(async () => ctx, now, {
      kind: 'action', tool: 'opencode', summary: 'edited server.ts', taskId,
    })
    expect(r.isError).toBeFalsy()
    const state = await ctx.ledger.getState('r1')
    expect(state?.actions.at(-1)?.summary).toBe('edited server.ts')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/tools.test.ts`
Expected: FAIL — `recordHandler` not exported.

- [ ] **Step 3: Implement the handler + registration**

Append to `apps/octowiz-mcp/src/tools.ts`:
```typescript
import { z } from 'zod'

const recordInput = {
  kind: z.enum(['task_created', 'task_status', 'review', 'action']),
  // task_created
  title: z.string().optional(),
  description: z.string().optional(),
  // task_status
  taskId: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'in_review', 'validated', 'merged', 'blocked']).optional(),
  // review
  reviewerId: z.string().optional(),
  verdict: z.enum(['approved', 'rejected', 'changes_requested']).optional(),
  notes: z.string().optional(),
  // action
  tool: z.string().optional(),
  summary: z.string().optional(),
}

type RecordArgs = {
  kind: 'task_created' | 'task_status' | 'review' | 'action'
  title?: string, description?: string
  taskId?: string, status?: 'open' | 'in_progress' | 'in_review' | 'validated' | 'merged' | 'blocked'
  reviewerId?: string, verdict?: 'approved' | 'rejected' | 'changes_requested', notes?: string
  tool?: string, summary?: string
}

export async function recordHandler(getCtx: () => Promise<Ctx>, now: () => string, args: RecordArgs): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const at = now()
  const idFrom = (p: string) => `${p}${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
  switch (args.kind) {
    case 'task_created': {
      if (!args.title) return errText('task_created requires `title`')
      const task = { id: idFrom('t'), roomId, title: args.title, description: args.description, status: 'open' as const }
      await ledger.createTask(task, at)
      return okText(`task ${task.id} created`)
    }
    case 'task_status': {
      if (!args.taskId || !args.status) return errText('task_status requires `taskId` and `status`')
      await ledger.setTaskStatus(roomId, args.taskId, args.status, at)
      return okText(`task ${args.taskId} -> ${args.status}`)
    }
    case 'review': {
      if (!args.taskId || !args.reviewerId || !args.verdict) return errText('review requires `taskId`, `reviewerId`, `verdict`')
      const review = { id: idFrom('rv'), taskId: args.taskId, reviewerId: args.reviewerId, verdict: args.verdict, notes: args.notes, createdAt: at }
      await ledger.recordReview(roomId, review, at)
      return okText(`review ${review.id} (${args.verdict}) recorded`)
    }
    case 'action': {
      if (!args.tool || !args.summary) return errText('action requires `tool` and `summary`')
      await ledger.recordAction(roomId, args.tool, args.summary, at, args.taskId)
      return okText('action recorded')
    }
  }
}
```
Then, inside `registerTools`, add:
```typescript
  server.registerTool(
    'octowiz_record',
    {
      description: 'Record a milestone to the room ledger: task_created | task_status | review | action. Call at meaningful points, not per edit.',
      inputSchema: recordInput,
    },
    failOpen(async (args: RecordArgs) => recordHandler(getCtx, nowFor(server), args)),
  )
```
> `registerTools` needs `now`. Change its signature to `registerTools(server, getCtx, now: () => string)` and thread `now` through (update Task 6's call site and the integration in Task 10). Replace `nowFor(server)` above with the passed `now`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/tools.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/octowiz-mcp/src/tools.ts apps/octowiz-mcp/src/tools.test.ts
git commit -m "feat(octowiz-mcp): octowiz_record milestone tool"
```

---

### Task 8: Tools `octowiz_validate` + `octowiz_merge_ready`

**Files:**
- Modify: `apps/octowiz-mcp/src/tools.ts`
- Modify: `apps/octowiz-mcp/src/tools.test.ts`

**Interfaces:**
- Consumes: `runValidation`, `DEFAULT_CHECKS` from `@octowiz/validation`; `isMergeReady` from `@octowiz/doctrine`; `Run`/`defaultRun` from `./run.js`.
- Produces: `validateHandler(getCtx, now, run, args)` and `mergeReadyHandler(getCtx, args)`. Registered as `octowiz_validate`, `octowiz_merge_ready`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/octowiz-mcp/src/tools.test.ts`:
```typescript
import { validateHandler, mergeReadyHandler } from './tools.js'
import type { Run } from './run.js'

describe('octowiz_validate', () => {
  it('runs checks via an injected Run and records a passing validation', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:03:00.000Z'
    await recordHandler(async () => ctx, now, { kind: 'task_created', title: 't' })
    const taskId = (await ctx.ledger.getState('r1'))!.tasks.at(-1)!.id
    const passRun: Run = async () => ({ code: 0, stdout: 'ok', stderr: '' })
    const r = await validateHandler(async () => ctx, now, passRun, { taskId })
    expect(r.isError).toBeFalsy()
    const state = await ctx.ledger.getState('r1')
    expect(state?.validations.at(-1)?.status).toBe('passed')
  })
})

describe('octowiz_merge_ready', () => {
  it('reports not-ready with reasons for a fresh task', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:04:00.000Z'
    await recordHandler(async () => ctx, now, { kind: 'task_created', title: 't' })
    const taskId = (await ctx.ledger.getState('r1'))!.tasks.at(-1)!.id
    const r = await mergeReadyHandler(async () => ctx, { taskId })
    const parsed = JSON.parse(r.content[0].text)
    expect(parsed.ready).toBe(false)
    expect(Array.isArray(parsed.reasons)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/tools.test.ts`
Expected: FAIL — handlers not exported.

- [ ] **Step 3: Implement**

Append to `apps/octowiz-mcp/src/tools.ts`:
```typescript
import { runValidation, DEFAULT_CHECKS } from '@octowiz/validation'
import { isMergeReady } from '@octowiz/doctrine'
import type { Run } from './run.js'

export async function validateHandler(getCtx: () => Promise<Ctx>, now: () => string, run: Run, args: { taskId: string }): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const at = now()
  const validation = await runValidation(args.taskId, DEFAULT_CHECKS, run, at)
  await ledger.recordValidation(roomId, validation, at)
  if (validation.status === 'passed') await ledger.setTaskStatus(roomId, args.taskId, 'validated', at)
  return okText(JSON.stringify(validation, null, 2))
}

export async function mergeReadyHandler(getCtx: () => Promise<Ctx>, args: { taskId: string }): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const state = await ledger.getState(roomId)
  if (!state) return errText(`room ${roomId} not found`)
  return okText(JSON.stringify(isMergeReady(state, args.taskId), null, 2))
}
```
Add to `registerTools`:
```typescript
  server.registerTool(
    'octowiz_validate',
    { description: 'Run lint/type-check/test for a task, record the validation, advance to validated if passed.', inputSchema: { taskId: z.string() } },
    failOpen(async (args: { taskId: string }) => validateHandler(getCtx, now, run, args)),
  )
  server.registerTool(
    'octowiz_merge_ready',
    { description: 'Doctrine gate: is a task merge-ready? (passing validation + a qualified non-self approval).', inputSchema: { taskId: z.string() } },
    failOpen(async (args: { taskId: string }) => mergeReadyHandler(getCtx, args)),
  )
```
> `registerTools` now also needs `run: Run`. Final signature: `registerTools(server, getCtx, now, run)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/octowiz-mcp/src/tools.ts apps/octowiz-mcp/src/tools.test.ts
git commit -m "feat(octowiz-mcp): octowiz_validate + octowiz_merge_ready tools"
```

---

### Task 9: Tool `octowiz_select_skills`

**Files:**
- Modify: `apps/octowiz-mcp/src/tools.ts`
- Modify: `apps/octowiz-mcp/src/tools.test.ts`

**Interfaces:**
- Consumes: `loadApprovedSkills`, `selectSkills` from `@octowiz/skill-runtime`; `readFile` from `node:fs/promises`.
- Produces: `selectSkillsHandler(getCtx, registryPath, args)`. Registered as `octowiz_select_skills`. Registry path resolved relative to the octowiz-v2 repo (`skills/registry.json`).

- [ ] **Step 1: Write the failing test**

Append to `apps/octowiz-mcp/src/tools.test.ts`:
```typescript
import { selectSkillsHandler } from './tools.js'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

describe('octowiz_select_skills', () => {
  it('returns skills for a stage from the real registry', async () => {
    const ctx = await fixtureCtx()
    // octowiz-v2 repo root from this test file: apps/octowiz-mcp/src -> ../../../
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    const registry = join(repoRoot, 'skills', 'registry.json')
    const r = await selectSkillsHandler(async () => ctx, registry, { stage: 'review' })
    expect(r.isError).toBeFalsy()
    const skills = JSON.parse(r.content[0].text)
    expect(Array.isArray(skills)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/tools.test.ts`
Expected: FAIL — `selectSkillsHandler` not exported.

- [ ] **Step 3: Implement**

Append to `apps/octowiz-mcp/src/tools.ts`:
```typescript
import { readFile } from 'node:fs/promises'
import { loadApprovedSkills, selectSkills } from '@octowiz/skill-runtime'

export async function selectSkillsHandler(
  getCtx: () => Promise<Ctx>,
  registryPath: string,
  args: { stage: 'plan' | 'implement' | 'review' | 'validate' | 'escalate' | 'deliver', role?: string[] },
): Promise<ToolResult> {
  await getCtx() // ensures a room exists / consistent with other tools
  const skills = await loadApprovedSkills(p => readFile(p, 'utf8'), registryPath)
  const selected = selectSkills(skills, { stage: args.stage, role: args.role })
  return okText(JSON.stringify(selected, null, 2))
}
```
Add to `registerTools` (thread a `registryPath` param: final signature `registerTools(server, getCtx, now, run, registryPath)`):
```typescript
  server.registerTool(
    'octowiz_select_skills',
    {
      description: 'Skills relevant to the current workflow stage from the approved registry.',
      inputSchema: { stage: z.enum(['plan', 'implement', 'review', 'validate', 'escalate', 'deliver']), role: z.array(z.string()).optional() },
    },
    failOpen(async (args: { stage: any, role?: string[] }) => selectSkillsHandler(getCtx, registryPath, args)),
  )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/octowiz-mcp/src/tools.ts apps/octowiz-mcp/src/tools.test.ts
git commit -m "feat(octowiz-mcp): octowiz_select_skills tool"
```

---

### Task 10: Wire everything into the server + stdio entry + smoke test

**Files:**
- Modify: `apps/octowiz-mcp/src/server.ts`
- Modify: `apps/octowiz-mcp/src/index.ts`
- Create: `apps/octowiz-mcp/src/smoke.test.ts`

**Interfaces:**
- Consumes: `registerTools(server, getCtx, now, run, registryPath)`, `makeContext`, `defaultRun`.

- [ ] **Step 1: Finalize `createServer` to register tools**

Replace `apps/octowiz-mcp/src/server.ts` body:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { makeContext } from './context.js'
import { registerTools } from './tools.js'
import { defaultRun } from './run.js'

export interface ServerDeps {
  ledgerDirFor: () => Promise<string>
  listRoots?: () => Promise<{ roots: { uri: string, name?: string }[] }>
  cwd: string
  now: () => string
}

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'octowiz', version: '0.1.0' })
  const getCtx = makeContext(deps)
  // octowiz-v2 repo root from this file: apps/octowiz-mcp/src -> ../../../
  const registryPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'registry.json')
  registerTools(server, getCtx, deps.now, defaultRun, registryPath)
  return server
}
```

- [ ] **Step 2: Wire `listRoots` from the connected server in `index.ts`**

Replace `apps/octowiz-mcp/src/index.ts`:
```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'
import { makeLedgerResolver } from './room.js'

const cwd = process.cwd()
// listRoots delegates to the low-level server once connected (client must advertise roots).
const server = createServer({
  cwd,
  now: () => new Date().toISOString(),
  listRoots: async () => server.server.listRoots(),
  ledgerDirFor: makeLedgerResolver({ cwd, listRoots: async () => server.server.listRoots() }),
})

const transport = new StdioServerTransport()
await server.connect(transport)
```
> `server.server.listRoots()` is the SDK's request to the client for `roots/list`; it throws if the client doesn't support roots — which is why `resolveRepoRoot` catches and falls back to git/cwd.

- [ ] **Step 3: Write a smoke test (server boots + registers the 5 tools)**

`apps/octowiz-mcp/src/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createServer } from './server.js'

describe('server smoke', () => {
  it('boots and exposes the expected tool names', async () => {
    const server = createServer({
      cwd: '/tmp', now: () => '2026-06-25T00:00:00.000Z',
      listRoots: undefined, ledgerDirFor: async () => '/tmp/.octowiz/ledger',
    })
    // McpServer keeps registered tools on the internal registry; assert via the public list.
    const names = Object.keys((server as any)._registeredTools ?? {})
    for (const t of ['octowiz_room_status', 'octowiz_record', 'octowiz_validate', 'octowiz_merge_ready', 'octowiz_select_skills'])
      expect(names).toContain(t)
  })
})
```
> If `_registeredTools` isn't the internal field in the installed SDK version, replace this assertion with an MCP in-memory client round-trip (`@modelcontextprotocol/sdk/client` + `InMemoryTransport`) calling `client.listTools()`. Verify the field name in `node_modules/@modelcontextprotocol/sdk` first.

- [ ] **Step 4: Run all tests + type-check**

Run: `pnpm vitest run && pnpm type-check`
Expected: all PASS, no type errors.

- [ ] **Step 5: Manual stdio boot check**

Run: `printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | pnpm --silent start`
Expected: a JSON-RPC response listing the 5 `octowiz_*` tools (after the server's initialize handshake; if it needs `initialize` first, use the MCP Inspector instead: `npx @modelcontextprotocol/inspector pnpm start`).

- [ ] **Step 6: Commit**

```bash
git add apps/octowiz-mcp/src/server.ts apps/octowiz-mcp/src/index.ts apps/octowiz-mcp/src/smoke.test.ts
git commit -m "feat(octowiz-mcp): wire tools into server + stdio entrypoint"
```

---

### Task 11: Register in opencode + verify `roots` behavior live

**Files:**
- Modify: `~/.config/opencode/opencode.jsonc` (user config — back it up first)

**Interfaces:** none (integration).

- [ ] **Step 1: Back up the opencode config**

Run: `cp ~/.config/opencode/opencode.jsonc ~/.config/opencode/opencode.jsonc.pre-mcp`

- [ ] **Step 2: Add the MCP server (tsx, absolute paths — no build)**

Add a top-level `"mcp"` block to `~/.config/opencode/opencode.jsonc`:
```jsonc
"mcp": {
  "octowiz": {
    "type": "local",
    "command": [
      "/Users/razu/Projects/octowiz-v2/node_modules/.bin/tsx",
      "/Users/razu/Projects/octowiz-v2/apps/octowiz-mcp/src/index.ts"
    ],
    "environment": {
      "LITELLM_API_KEY": "{env:LITELLM_API_KEY}",
      "LITELLM_BASE_URL": "https://llm.integrahub.de"
    }
  }
}
```
> Absolute `tsx` path = node resolves `@octowiz/*` from the script's location regardless of opencode's spawn cwd. `LITELLM_*` are unused in 2a (no network) but wired now so 2b needs no config change.

- [ ] **Step 3: Confirm opencode loads the server**

Run: `opencode mcp list 2>&1 | head` (from any directory)
Expected: `octowiz` listed (connected). If it errors, check `~/.local/share/opencode/log/opencode.log`.

- [ ] **Step 4: VERIFY ROOTS (the spec's open question)**

Launch opencode in the octowiz-v2 repo, ask it to call `octowiz_room_status`, then in a *different* repo do the same. Confirm:
- a `.octowiz/ledger` + `.octowiz/room.json` is created **in the repo you opened** (not in your home dir or opencode's data dir), and
- the room name matches the repo basename.

If the ledger lands in the wrong place, opencode is not returning the project dir via `roots/list` for stdio servers → the `resolveRepoRoot` git/cwd fallback is what's firing. Record the actual behavior here and, if needed, adjust resolution order (e.g. require git toplevel before cwd). **Do not mark Phase 2a done until this is confirmed.**

- [ ] **Step 5: Fail-open check (must not break daily opencode)**

Temporarily rename the app dir (`mv apps/octowiz-mcp apps/octowiz-mcp.off`), launch opencode, confirm it still starts and is fully usable (octowiz tools simply absent / server shows as failed in `opencode mcp list`). Restore (`mv` back).

- [ ] **Step 6: Commit the config note**

The user config isn't in this repo — instead, record the verified `mcp` block + roots finding in `docs/specs/2026-06-25-opencode-octowiz-aelli-mcp-design.md` (update open-question #1 with the result) and commit that doc.

```bash
git add docs/specs/2026-06-25-opencode-octowiz-aelli-mcp-design.md
git commit -m "docs(octowiz-mcp): record verified opencode MCP wiring + roots behavior"
```

---

## Self-Review

**Spec coverage:**
- Local tools (room_status/record/validate/merge_ready/select_skills) → Tasks 6–9. ✅
- Per-repo auto-room via roots+fallback → Tasks 3, 4, 11 (live verify). ✅
- Milestone recording, no hooks → Task 7 (intentional tool). ✅
- Fail-open → Task 5 wrapper + Task 11 Step 5 check. ✅
- Deploy (tsx, absolute path, no build) → Task 11. ✅
- A2A tools, naming-bug fix, commands, setup script → **Phase 2b/2c (separate plans)**, intentionally out of this plan.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to". Every code step has real code. The two SDK-version caveats (Task 10 Step 3 field name; Task 11 stdio handshake) are explicit verify-instructions, not placeholders.

**Type consistency:** `ServerDeps` (Task 1) extended in Task 10; `Ctx`/`ToolResult`/`okText`/`errText`/`failOpen` (Task 5) used unchanged in Tasks 6–9; `registerTools` signature grows monotonically (server,getCtx → +now → +run → +registryPath) with each task's call-site update noted; `Run` matches `@octowiz/validation`. Handler names (`roomStatusHandler`, `recordHandler`, `validateHandler`, `mergeReadyHandler`, `selectSkillsHandler`) are consistent between definition and tests.

**Known follow-ups (Phase 2b/2c):** ÆLLI A2A tools + `aelli`/`aelli-orchestrator` fix; slash commands; setup/sync script; re-resolve room on `roots/list_changed`.
