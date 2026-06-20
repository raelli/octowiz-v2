# Core Domain Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistent domain spine of octowiz-v2 — shared Zod schemas, an event-sourced file-backed room ledger, and the two load-bearing doctrine rules — proven by a tracer-bullet integration test.

**Architecture:** Event sourcing. `@octowiz/schemas` defines a versioned vocabulary and a `LedgerEvent` discriminated union. `@octowiz/room-ledger` appends events to per-room `events.jsonl` behind a `LedgerStore` interface and folds them into `RoomState` via a pure reducer. `@octowiz/doctrine` is pure functions over `RoomState`. Storage hides behind an interface so SQLite can replace files later without touching callers.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), Zod 4, Vitest, Node stdlib (`node:fs/promises`, `node:path`, `node:os`), pnpm workspace + catalog.

## Global Constraints

- **Package manager:** pnpm `11.8.0`. Shared dep versions live in the `catalog:` block of `pnpm-workspace.yaml`, referenced as `"catalog:"` in each package.json.
- **Supply chain:** `minimumReleaseAge: 1440` is set — pin new deps to a range that admits a >24h-old version (`zod: ^4.4.0`, not an exact bleeding-edge pin). Zod and `@types/node` have no install build scripts, so no `allowBuilds` entry is needed.
- **Package shape:** scope `@octowiz/*`; `"private": true`; `"type": "module"`; `"types": "./src/index.ts"` and `"exports": { ".": "./src/index.ts" }`.
- **TypeScript:** every package `tsconfig.json` is `{ "extends": "../config-typescript/base.json", "include": ["src"] }`. Base enforces `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `moduleDetection: force`. **Use `import type` for type-only imports** or the build breaks.
- **Import boundaries:** `packages/*` may import only `@octowiz/*` workspace packages and `node:` builtins — never `apps/*` or `layers/*`. Enforced by lint (`no-restricted-imports`) and structurally by pnpm (only declared deps resolve).
- **Tests:** Vitest, zero-config. Test files are `*.test.ts` colocated in `src/`. Run with `vitest run` (each package's `test` script) or `pnpm -r --parallel test` from the root.
- **Commits:** Conventional Commits (enforced by commitlint on `commit-msg`). Secretlint runs on staged files on `pre-commit`.
- **Docs:** each package keeps a `README.md` ending with an `Allowed imports:` line (see `docs/templates/package-readme.md`).

---

### Task 1: `@octowiz/schemas` — domain vocabulary + ledger events

Fills in the existing stub package (currently exports only `SCHEMAS_VERSION = '0.0.0'`).

**Files:**
- Modify: `pnpm-workspace.yaml` (add `zod` to catalog)
- Modify: `packages/schemas/package.json` (add `zod` dependency)
- Modify: `packages/schemas/src/index.ts` (replace stub with real schemas)
- Modify: `packages/schemas/src/index.test.ts` (replace stub test)
- Modify: `packages/schemas/README.md` (describe real content)

**Interfaces:**
- Consumes: nothing (leaf package).
- Produces — **value exports** (Zod schemas) and **same-named type exports** (`z.infer`):
  `SCHEMAS_VERSION: '0.1.0'`; `Participant`, `ParticipantKind`, `ParticipantRole`, `Room`, `RoomStatus`, `Task`, `TaskStatus`, `Review`, `ReviewVerdict`, `Validation`, `ValidationCheck`, `CheckStatus`, `Escalation`, `LedgerEvent` (discriminated union on `type`), `RoomState`.
  `LedgerEvent` variants by `type`: `room.created {room}`, `participant.joined {participant}`, `task.created {task}`, `task.status_changed {taskId,status}`, `task.assigned {taskId,implementerId}`, `review.recorded {review}`, `validation.recorded {validation}`, `escalation.recorded {escalation}` — every variant also has `at: string`.

- [ ] **Step 1: Add `zod` to the pnpm catalog**

Edit `pnpm-workspace.yaml`, add to the `catalog:` block (keep alphabetical):

```yaml
catalog:
  "@antfu/eslint-config": ^9.0.0
  eslint: ^10.5.0
  typescript: ^6.0.3
  vitest: ^4.1.9
  zod: ^4.4.0
```

- [ ] **Step 2: Add `zod` as a dependency of schemas**

Edit `packages/schemas/package.json` — add a `dependencies` block (place before `devDependencies`):

```json
  "dependencies": {
    "zod": "catalog:"
  },
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: exit 0, `zod` linked into `packages/schemas/node_modules`, no `ERR_PNPM_IGNORED_BUILDS`.

- [ ] **Step 4: Write the failing tests**

Replace `packages/schemas/src/index.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { LedgerEvent, Room, SCHEMAS_VERSION } from './index'

describe('schemas', () => {
  it('exposes the bumped version', () => {
    expect(SCHEMAS_VERSION).toBe('0.1.0')
  })

  it('parses a valid room', () => {
    const room = Room.parse({ id: 'r1', name: 'Room One', status: 'active', createdAt: '2026-06-20T00:00:00Z' })
    expect(room.id).toBe('r1')
  })

  it('rejects a room with an unknown status', () => {
    expect(() => Room.parse({ id: 'r1', name: 'Room One', status: 'nope', createdAt: 'x' })).toThrow()
  })

  it('parses a room.created event and rejects an unknown event type', () => {
    const event = LedgerEvent.parse({
      type: 'room.created',
      at: '2026-06-20T00:00:00Z',
      room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 'x' },
    })
    expect(event.type).toBe('room.created')
    expect(() => LedgerEvent.parse({ type: 'bogus', at: 'x' })).toThrow()
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm --filter @octowiz/schemas test`
Expected: FAIL — `SCHEMAS_VERSION` is `'0.0.0'`, and `Room` / `LedgerEvent` are not exported yet.

- [ ] **Step 6: Write the schemas**

Replace `packages/schemas/src/index.ts` with:

```ts
import { z } from 'zod'

export const SCHEMAS_VERSION = '0.1.0' as const
export type SchemasVersion = typeof SCHEMAS_VERSION

export const ParticipantKind = z.enum(['human', 'agent'])
export type ParticipantKind = z.infer<typeof ParticipantKind>

export const ParticipantRole = z.enum(['implementer', 'reviewer', 'validator', 'advisor', 'steward'])
export type ParticipantRole = z.infer<typeof ParticipantRole>

export const Participant = z.object({
  id: z.string().min(1),
  kind: ParticipantKind,
  roles: z.array(ParticipantRole),
  displayName: z.string().min(1),
})
export type Participant = z.infer<typeof Participant>

export const RoomStatus = z.enum(['active', 'archived'])
export type RoomStatus = z.infer<typeof RoomStatus>

export const Room = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: RoomStatus,
  createdAt: z.string().min(1),
})
export type Room = z.infer<typeof Room>

export const TaskStatus = z.enum(['open', 'in_progress', 'in_review', 'validated', 'merged', 'blocked'])
export type TaskStatus = z.infer<typeof TaskStatus>

export const Task = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatus,
  implementerId: z.string().min(1).optional(),
})
export type Task = z.infer<typeof Task>

export const ReviewVerdict = z.enum(['approved', 'rejected', 'changes_requested'])
export type ReviewVerdict = z.infer<typeof ReviewVerdict>

export const Review = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  reviewerId: z.string().min(1),
  verdict: ReviewVerdict,
  notes: z.string().optional(),
  createdAt: z.string().min(1),
})
export type Review = z.infer<typeof Review>

export const CheckStatus = z.enum(['passed', 'failed'])
export type CheckStatus = z.infer<typeof CheckStatus>

export const ValidationCheck = z.object({
  name: z.string().min(1),
  status: CheckStatus,
  output: z.string().optional(),
})
export type ValidationCheck = z.infer<typeof ValidationCheck>

export const Validation = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  status: CheckStatus,
  checks: z.array(ValidationCheck),
  createdAt: z.string().min(1),
})
export type Validation = z.infer<typeof Validation>

export const Escalation = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  reason: z.string().min(1),
  recommendation: z.string().optional(),
  createdAt: z.string().min(1),
})
export type Escalation = z.infer<typeof Escalation>

// Append-only ledger events. `at` is a caller-supplied ISO timestamp string —
// keeping time out of the pure core makes the reducer deterministic and testable.
export const LedgerEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.created'), at: z.string().min(1), room: Room }),
  z.object({ type: z.literal('participant.joined'), at: z.string().min(1), participant: Participant }),
  z.object({ type: z.literal('task.created'), at: z.string().min(1), task: Task }),
  z.object({ type: z.literal('task.status_changed'), at: z.string().min(1), taskId: z.string().min(1), status: TaskStatus }),
  z.object({ type: z.literal('task.assigned'), at: z.string().min(1), taskId: z.string().min(1), implementerId: z.string().min(1) }),
  z.object({ type: z.literal('review.recorded'), at: z.string().min(1), review: Review }),
  z.object({ type: z.literal('validation.recorded'), at: z.string().min(1), validation: Validation }),
  z.object({ type: z.literal('escalation.recorded'), at: z.string().min(1), escalation: Escalation }),
])
export type LedgerEvent = z.infer<typeof LedgerEvent>

// Projection of the event log. `room` is always present once the log is non-empty
// (the first event must be room.created — enforced by the room-ledger reducer).
export const RoomState = z.object({
  room: Room,
  participants: z.array(Participant),
  tasks: z.array(Task),
  reviews: z.array(Review),
  validations: z.array(Validation),
  escalations: z.array(Escalation),
})
export type RoomState = z.infer<typeof RoomState>
```

- [ ] **Step 7: Run tests + type-check to verify they pass**

Run: `pnpm --filter @octowiz/schemas test && pnpm --filter @octowiz/schemas type-check`
Expected: PASS, no type errors.

- [ ] **Step 8: Update the README**

Replace `packages/schemas/README.md` with:

```markdown
# @octowiz/schemas

Shared, versioned Zod schemas and inferred types for the octowiz domain: rooms,
participants, tasks, reviews, validations, escalations, the `LedgerEvent` union, and
the `RoomState` projection. `SCHEMAS_VERSION` is stamped into persisted data.

Each export is both a Zod schema (value) and a same-named inferred type. Parse, don't
cast, at every trust boundary.

Allowed imports: `zod` and other `packages/*` only.
```

- [ ] **Step 9: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/schemas
git commit -m "feat(schemas): add domain entities, ledger events, and RoomState"
```

---

### Task 2: `@octowiz/room-ledger` — event-sourced, file-backed ledger

New package. Pure reducer + `LedgerStore` interface + `FileLedgerStore` + `RoomLedger` facade.

**Files:**
- Create: `packages/room-ledger/package.json`
- Create: `packages/room-ledger/tsconfig.json`
- Create: `packages/room-ledger/README.md`
- Create: `packages/room-ledger/src/reducer.ts`
- Create: `packages/room-ledger/src/reducer.test.ts`
- Create: `packages/room-ledger/src/store.ts`
- Create: `packages/room-ledger/src/store.test.ts`
- Create: `packages/room-ledger/src/ledger.ts`
- Create: `packages/room-ledger/src/index.ts`
- Modify: `pnpm-workspace.yaml` (add `@types/node` to catalog)

**Interfaces:**
- Consumes from `@octowiz/schemas`: `LedgerEvent`, `RoomState`, `Room`, `Participant`, `Task`, `TaskStatus`, `Review`, `Validation`, `Escalation`.
- Produces:
  - `applyEvent(state: RoomState | null, event: LedgerEvent): RoomState`
  - `applyEvents(events: LedgerEvent[]): RoomState | null`
  - `interface LedgerStore { appendEvent(roomId, event): Promise<void>; readEvents(roomId): Promise<LedgerEvent[]>; listRooms(): Promise<string[]> }`
  - `class FileLedgerStore implements LedgerStore { constructor(rootDir: string) }`
  - `class RoomLedger { constructor(store: LedgerStore); getState(roomId): Promise<RoomState | null>; createRoom(room, at); addParticipant(roomId, participant, at); createTask(task, at); assignTask(roomId, taskId, implementerId, at); setTaskStatus(roomId, taskId, status, at); recordReview(roomId, review, at); recordValidation(roomId, validation, at); recordEscalation(roomId, escalation, at) }` — every mutator returns `Promise<RoomState>`.

- [ ] **Step 1: Add `@types/node` to the pnpm catalog**

Edit `pnpm-workspace.yaml` `catalog:` block (keep alphabetical, scoped names first):

```yaml
catalog:
  "@antfu/eslint-config": ^9.0.0
  "@types/node": ^22.0.0
  eslint: ^10.5.0
  typescript: ^6.0.3
  vitest: ^4.1.9
  zod: ^4.4.0
```

- [ ] **Step 2: Create the package manifest**

Create `packages/room-ledger/package.json`:

```json
{
  "name": "@octowiz/room-ledger",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@octowiz/schemas": "workspace:*"
  },
  "devDependencies": {
    "@octowiz/config-typescript": "workspace:*",
    "@octowiz/doctrine": "workspace:*",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

> Note: `@octowiz/doctrine` is a **devDependency** (used only by the Task 4 integration test). It does not create a runtime cycle — doctrine depends on schemas, not on room-ledger.

- [ ] **Step 3: Create the tsconfig**

Create `packages/room-ledger/tsconfig.json`:

```json
{
  "extends": "../config-typescript/base.json",
  "include": ["src"]
}
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: exit 0, workspace links resolved.

- [ ] **Step 5: Write the failing reducer test**

Create `packages/room-ledger/src/reducer.test.ts`:

```ts
import type { LedgerEvent } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { applyEvent, applyEvents } from './reducer'

const room = { id: 'r1', name: 'Room One', status: 'active' as const, createdAt: 't0' }
const created: LedgerEvent = { type: 'room.created', at: 't0', room }

describe('applyEvent', () => {
  it('creates initial state from room.created', () => {
    const state = applyEvent(null, created)
    expect(state.room.id).toBe('r1')
    expect(state.participants).toEqual([])
  })

  it('throws if the first event is not room.created', () => {
    expect(() => applyEvent(null, { type: 'task.status_changed', at: 't1', taskId: 'x', status: 'open' })).toThrow()
  })

  it('folds participant, task, assignment, status, review, validation, escalation', () => {
    const events: LedgerEvent[] = [
      created,
      { type: 'participant.joined', at: 't1', participant: { id: 'p1', kind: 'agent', roles: ['implementer'], displayName: 'Impl' } },
      { type: 'task.created', at: 't2', task: { id: 'tk1', roomId: 'r1', title: 'Do it', status: 'open' } },
      { type: 'task.assigned', at: 't3', taskId: 'tk1', implementerId: 'p1' },
      { type: 'task.status_changed', at: 't4', taskId: 'tk1', status: 'in_review' },
      { type: 'review.recorded', at: 't5', review: { id: 'rv1', taskId: 'tk1', reviewerId: 'p2', verdict: 'approved', createdAt: 't5' } },
      { type: 'validation.recorded', at: 't6', validation: { id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't6' } },
      { type: 'escalation.recorded', at: 't7', escalation: { id: 'e1', roomId: 'r1', reason: 'stuck', createdAt: 't7' } },
    ]
    const state = applyEvents(events)!
    expect(state.participants).toHaveLength(1)
    expect(state.tasks[0]).toMatchObject({ implementerId: 'p1', status: 'in_review' })
    expect(state.reviews).toHaveLength(1)
    expect(state.validations).toHaveLength(1)
    expect(state.escalations).toHaveLength(1)
  })

  it('returns null for an empty event log', () => {
    expect(applyEvents([])).toBeNull()
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @octowiz/room-ledger test`
Expected: FAIL — `./reducer` does not exist.

- [ ] **Step 7: Write the reducer**

Create `packages/room-ledger/src/reducer.ts`:

```ts
import type { LedgerEvent, RoomState } from '@octowiz/schemas'

/** Fold a single event onto the running state. The first event must be room.created. */
export function applyEvent(state: RoomState | null, event: LedgerEvent): RoomState {
  if (state === null) {
    if (event.type !== 'room.created')
      throw new Error(`first event must be room.created, got "${event.type}"`)
    return { room: event.room, participants: [], tasks: [], reviews: [], validations: [], escalations: [] }
  }

  switch (event.type) {
    case 'room.created':
      throw new Error('room.created received but the room already exists')
    case 'participant.joined':
      return { ...state, participants: [...state.participants, event.participant] }
    case 'task.created':
      return { ...state, tasks: [...state.tasks, event.task] }
    case 'task.assigned':
      return { ...state, tasks: state.tasks.map(t => t.id === event.taskId ? { ...t, implementerId: event.implementerId } : t) }
    case 'task.status_changed':
      return { ...state, tasks: state.tasks.map(t => t.id === event.taskId ? { ...t, status: event.status } : t) }
    case 'review.recorded':
      return { ...state, reviews: [...state.reviews, event.review] }
    case 'validation.recorded':
      return { ...state, validations: [...state.validations, event.validation] }
    case 'escalation.recorded':
      return { ...state, escalations: [...state.escalations, event.escalation] }
  }
}

/** Fold an entire event log. Returns null for an empty log (no room yet). */
export function applyEvents(events: LedgerEvent[]): RoomState | null {
  return events.reduce<RoomState | null>((state, event) => applyEvent(state, event), null)
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @octowiz/room-ledger test`
Expected: PASS.

- [ ] **Step 9: Write the failing store test**

Create `packages/room-ledger/src/store.test.ts`:

```ts
import type { LedgerEvent } from '@octowiz/schemas'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileLedgerStore } from './store'

const created: LedgerEvent = {
  type: 'room.created',
  at: 't0',
  room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' },
}

async function tmpRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'octowiz-ledger-'))
}

describe('FileLedgerStore', () => {
  it('returns [] for a room with no events', async () => {
    const store = new FileLedgerStore(await tmpRoot())
    expect(await store.readEvents('missing')).toEqual([])
  })

  it('round-trips appended events', async () => {
    const store = new FileLedgerStore(await tmpRoot())
    await store.appendEvent('r1', created)
    await store.appendEvent('r1', { type: 'task.created', at: 't1', task: { id: 'tk1', roomId: 'r1', title: 'Do it', status: 'open' } })
    const events = await store.readEvents('r1')
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'room.created' })
    expect(await store.listRooms()).toContain('r1')
  })

  it('throws when a stored line is corrupt', async () => {
    const root = await tmpRoot()
    const store = new FileLedgerStore(root)
    await store.appendEvent('r1', created)
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(root, 'r1'), { recursive: true })
    await writeFile(join(root, 'r1', 'events.jsonl'), '{"type":"nonsense"}\n', 'utf8')
    await expect(store.readEvents('r1')).rejects.toThrow()
  })
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm --filter @octowiz/room-ledger test`
Expected: FAIL — `./store` does not exist.

- [ ] **Step 11: Write the store**

Create `packages/room-ledger/src/store.ts`:

```ts
import type { LedgerEvent as LedgerEventType } from '@octowiz/schemas'
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LedgerEvent } from '@octowiz/schemas'

/** Storage backend for a room's append-only event log. Backend-agnostic by design. */
export interface LedgerStore {
  appendEvent: (roomId: string, event: LedgerEventType) => Promise<void>
  readEvents: (roomId: string) => Promise<LedgerEventType[]>
  listRooms: () => Promise<string[]>
}

const EVENTS_FILE = 'events.jsonl'

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

/** File-backed store: one `<rootDir>/<roomId>/events.jsonl` per room, one event per line. */
export class FileLedgerStore implements LedgerStore {
  constructor(private readonly rootDir: string) {}

  async appendEvent(roomId: string, event: LedgerEventType): Promise<void> {
    const dir = join(this.rootDir, roomId)
    await mkdir(dir, { recursive: true })
    await appendFile(join(dir, EVENTS_FILE), `${JSON.stringify(event)}\n`, 'utf8')
  }

  async readEvents(roomId: string): Promise<LedgerEventType[]> {
    let raw: string
    try {
      raw = await readFile(join(this.rootDir, roomId, EVENTS_FILE), 'utf8')
    }
    catch (error) {
      if (isENOENT(error)) return []
      throw error
    }
    // Files are a trust boundary (hand-editable) — parse every line, don't cast.
    return raw
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => LedgerEvent.parse(JSON.parse(line)))
  }

  async listRooms(): Promise<string[]> {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true })
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
    }
    catch (error) {
      if (isENOENT(error)) return []
      throw error
    }
  }
}
```

- [ ] **Step 12: Run it to verify it passes**

Run: `pnpm --filter @octowiz/room-ledger test`
Expected: PASS.

- [ ] **Step 13: Write the `RoomLedger` facade**

Create `packages/room-ledger/src/ledger.ts`:

```ts
import type {
  Escalation,
  LedgerEvent,
  Participant,
  Review,
  Room,
  RoomState,
  Task,
  TaskStatus,
  Validation,
} from '@octowiz/schemas'
import type { LedgerStore } from './store'
import { applyEvents } from './reducer'

/** Typed facade over a LedgerStore: build → append → project. Callers supply `at`. */
export class RoomLedger {
  constructor(private readonly store: LedgerStore) {}

  async getState(roomId: string): Promise<RoomState | null> {
    return applyEvents(await this.store.readEvents(roomId))
  }

  private async appendAndProject(roomId: string, event: LedgerEvent): Promise<RoomState> {
    await this.store.appendEvent(roomId, event)
    const state = await this.getState(roomId)
    if (state === null)
      throw new Error(`room "${roomId}" has no state after appending ${event.type}`)
    return state
  }

  createRoom(room: Room, at: string): Promise<RoomState> {
    return this.appendAndProject(room.id, { type: 'room.created', at, room })
  }

  addParticipant(roomId: string, participant: Participant, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'participant.joined', at, participant })
  }

  createTask(task: Task, at: string): Promise<RoomState> {
    return this.appendAndProject(task.roomId, { type: 'task.created', at, task })
  }

  assignTask(roomId: string, taskId: string, implementerId: string, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'task.assigned', at, taskId, implementerId })
  }

  setTaskStatus(roomId: string, taskId: string, status: TaskStatus, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'task.status_changed', at, taskId, status })
  }

  recordReview(roomId: string, review: Review, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'review.recorded', at, review })
  }

  recordValidation(roomId: string, validation: Validation, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'validation.recorded', at, validation })
  }

  recordEscalation(roomId: string, escalation: Escalation, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'escalation.recorded', at, escalation })
  }
}
```

- [ ] **Step 14: Write the barrel export**

Create `packages/room-ledger/src/index.ts`:

```ts
export { RoomLedger } from './ledger'
export { applyEvent, applyEvents } from './reducer'
export { FileLedgerStore } from './store'
export type { LedgerStore } from './store'
```

- [ ] **Step 15: Run test + type-check**

Run: `pnpm --filter @octowiz/room-ledger test && pnpm --filter @octowiz/room-ledger type-check`
Expected: PASS, no type errors.

- [ ] **Step 16: Write the README**

Create `packages/room-ledger/README.md`:

```markdown
# @octowiz/room-ledger

Event-sourced room state. Each room is an append-only `events.jsonl` log; current
`RoomState` is a pure fold (`applyEvent`) over the log. Storage hides behind the
`LedgerStore` interface — `FileLedgerStore` is the MVP backend; SQLite can replace it
without touching callers. `RoomLedger` is the typed facade.

Callers supply event timestamps (`at`) so the reducer stays deterministic.

Allowed imports: `@octowiz/schemas`, `node:` builtins, and other `packages/*` only.
```

- [ ] **Step 17: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/room-ledger
git commit -m "feat(room-ledger): event-sourced file-backed room ledger"
```

---

### Task 3: `@octowiz/doctrine` — no-self-review + merge-readiness

Replaces the existing `DOCTRINE_BASED_ON_SCHEMAS` stub.

**Files:**
- Modify: `packages/doctrine/package.json` (add vitest devDep + `test` script)
- Modify: `packages/doctrine/src/index.ts` (replace stub)
- Create: `packages/doctrine/src/index.test.ts`
- Modify: `packages/doctrine/README.md`

**Interfaces:**
- Consumes from `@octowiz/schemas`: `RoomState` (type).
- Produces:
  - `canReview(state: RoomState, taskId: string, reviewerId: string): boolean`
  - `interface MergeReadiness { ready: boolean, reasons: string[] }`
  - `isMergeReady(state: RoomState, taskId: string): MergeReadiness`

- [ ] **Step 1: Add the test script + vitest devDep**

Edit `packages/doctrine/package.json` — add `"test": "vitest run"` to `scripts` and `"vitest": "catalog:"` to `devDependencies`:

```json
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@octowiz/schemas": "workspace:*"
  },
  "devDependencies": {
    "@octowiz/config-typescript": "workspace:*",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: exit 0.

- [ ] **Step 3: Write the failing tests**

Create `packages/doctrine/src/index.test.ts`:

```ts
import type { RoomState } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { canReview, isMergeReady } from './index'

function baseState(): RoomState {
  return {
    room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' },
    participants: [
      { id: 'impl', kind: 'agent', roles: ['implementer'], displayName: 'Impl' },
      { id: 'rev', kind: 'agent', roles: ['reviewer'], displayName: 'Rev' },
    ],
    tasks: [{ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'in_review', implementerId: 'impl' }],
    reviews: [],
    validations: [],
    escalations: [],
  }
}

describe('canReview', () => {
  it('allows a reviewer who is not the implementer', () => {
    expect(canReview(baseState(), 'tk1', 'rev')).toBe(true)
  })

  it('forbids the implementer reviewing their own task', () => {
    expect(canReview(baseState(), 'tk1', 'impl')).toBe(false)
  })

  it('forbids a participant without the reviewer role', () => {
    expect(canReview(baseState(), 'tk1', 'impl')).toBe(false)
    expect(canReview(baseState(), 'tk1', 'ghost')).toBe(false)
  })
})

describe('isMergeReady', () => {
  it('is not ready with no validation and no review', () => {
    const result = isMergeReady(baseState(), 'tk1')
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('no validation recorded')
    expect(result.reasons).toContain('no approving review from a non-implementer')
  })

  it('is not ready when only a self-approval exists', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'impl', verdict: 'approved', createdAt: 't2' })
    expect(isMergeReady(state, 'tk1').ready).toBe(false)
  })

  it('is ready with a passing validation and a non-implementer approval', () => {
    const state = baseState()
    state.validations.push({ id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't1' })
    state.reviews.push({ id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't2' })
    expect(isMergeReady(state, 'tk1')).toEqual({ ready: true, reasons: [] })
  })

  it('reports an unknown task', () => {
    expect(isMergeReady(baseState(), 'nope')).toEqual({ ready: false, reasons: ['task "nope" not found'] })
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @octowiz/doctrine test`
Expected: FAIL — `canReview` / `isMergeReady` not exported.

- [ ] **Step 5: Write the doctrine**

Replace `packages/doctrine/src/index.ts` with:

```ts
import type { RoomState } from '@octowiz/schemas'

/**
 * No self-review: a reviewer may review a task only if they are a known participant
 * holding the reviewer role and are not the task's implementer.
 */
export function canReview(state: RoomState, taskId: string, reviewerId: string): boolean {
  const task = state.tasks.find(t => t.id === taskId)
  if (task === undefined) return false
  if (task.implementerId === reviewerId) return false
  const reviewer = state.participants.find(p => p.id === reviewerId)
  if (reviewer === undefined) return false
  return reviewer.roles.includes('reviewer')
}

export interface MergeReadiness {
  ready: boolean
  reasons: string[]
}

/**
 * Merge readiness: the latest validation for the task must have passed, and at least
 * one approving review must exist from someone other than the implementer.
 * `reasons` lists every unmet condition (empty when ready).
 *
 * ponytail: waiver rules deferred — add a `waivers` argument when a real waiver flow
 * exists and let an active waiver satisfy the matching reason.
 */
export function isMergeReady(state: RoomState, taskId: string): MergeReadiness {
  const task = state.tasks.find(t => t.id === taskId)
  if (task === undefined)
    return { ready: false, reasons: [`task "${taskId}" not found`] }

  const reasons: string[] = []

  const latestValidation = state.validations.filter(v => v.taskId === taskId).at(-1)
  if (latestValidation === undefined)
    reasons.push('no validation recorded')
  else if (latestValidation.status !== 'passed')
    reasons.push('latest validation did not pass')

  const hasIndependentApproval = state.reviews.some(
    r => r.taskId === taskId && r.verdict === 'approved' && r.reviewerId !== task.implementerId,
  )
  if (!hasIndependentApproval)
    reasons.push('no approving review from a non-implementer')

  return { ready: reasons.length === 0, reasons }
}
```

- [ ] **Step 6: Run test + type-check**

Run: `pnpm --filter @octowiz/doctrine test && pnpm --filter @octowiz/doctrine type-check`
Expected: PASS.

- [ ] **Step 7: Update the README**

Replace `packages/doctrine/README.md` with:

```markdown
# @octowiz/doctrine

Pure process rules over `RoomState`:

- `canReview(state, taskId, reviewerId)` — enforces no self-review (reviewer must be a
  participant with the reviewer role and not the task's implementer).
- `isMergeReady(state, taskId)` — `{ ready, reasons }`; requires a passing validation
  and an approving review from a non-implementer.

Allowed imports: `@octowiz/schemas` and other `packages/*` only.
```

- [ ] **Step 8: Commit**

```bash
git add packages/doctrine
git commit -m "feat(doctrine): add no-self-review and merge-readiness rules"
```

---

### Task 4: Tracer-bullet integration test

Exercises the whole spine end-to-end: persist via `RoomLedger` + `FileLedgerStore`, reload from disk, evaluate with `doctrine`. Lives in `room-ledger` (which already devDepends on `@octowiz/doctrine` from Task 2).

**Files:**
- Create: `packages/room-ledger/src/integration.test.ts`

**Interfaces:**
- Consumes: `RoomLedger`, `FileLedgerStore` (from this package); `isMergeReady` (from `@octowiz/doctrine`).

- [ ] **Step 1: Write the integration test**

Create `packages/room-ledger/src/integration.test.ts`:

```ts
import { isMergeReady } from '@octowiz/doctrine'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileLedgerStore } from './store'
import { RoomLedger } from './ledger'

describe('tracer bullet: create → persist → reload → evaluate', () => {
  it('reaches merge-readiness only with a passing validation and an independent approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'octowiz-tracer-'))
    const ledger = new RoomLedger(new FileLedgerStore(root))

    await ledger.createRoom({ id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' }, 't0')
    await ledger.addParticipant('r1', { id: 'impl', kind: 'agent', roles: ['implementer'], displayName: 'Impl' }, 't1')
    await ledger.addParticipant('r1', { id: 'rev', kind: 'agent', roles: ['reviewer'], displayName: 'Rev' }, 't2')
    await ledger.createTask({ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'open' }, 't3')
    await ledger.assignTask('r1', 'tk1', 'impl', 't4')
    await ledger.setTaskStatus('r1', 'tk1', 'in_review', 't5')
    await ledger.recordValidation('r1', { id: 'v1', taskId: 'tk1', status: 'passed', checks: [], createdAt: 't6' }, 't6')
    await ledger.recordReview('r1', { id: 'rv1', taskId: 'tk1', reviewerId: 'rev', verdict: 'approved', createdAt: 't7' }, 't7')

    // Reload purely from disk — a fresh ledger over the same root.
    const reloaded = new RoomLedger(new FileLedgerStore(root))
    const state = await reloaded.getState('r1')
    expect(state).not.toBeNull()
    expect(isMergeReady(state!, 'tk1')).toEqual({ ready: true, reasons: [] })

    // A later rejecting review by the same reviewer does not remove the prior approval,
    // but flipping the validation to failed must block merge.
    await reloaded.recordValidation('r1', { id: 'v2', taskId: 'tk1', status: 'failed', checks: [{ name: 'test', status: 'failed' }], createdAt: 't8' }, 't8')
    const after = await reloaded.getState('r1')
    const verdict = isMergeReady(after!, 'tk1')
    expect(verdict.ready).toBe(false)
    expect(verdict.reasons).toContain('latest validation did not pass')
  })
})
```

- [ ] **Step 2: Run it to verify it passes**

Run: `pnpm --filter @octowiz/room-ledger test`
Expected: PASS (all reducer, store, and integration tests).

- [ ] **Step 3: Full-workspace gate**

Run: `pnpm lint && pnpm -r type-check && pnpm -r test`
Expected: all green — lint clean (import boundaries hold), every package type-checks, every test passes.

- [ ] **Step 4: Commit**

```bash
git add packages/room-ledger/src/integration.test.ts
git commit -m "test(room-ledger): tracer-bullet integration across the domain spine"
```

---

## Self-Review

**Spec coverage:**
- schemas entities + `LedgerEvent` + `RoomState` + version bump → Task 1. ✓
- `LedgerStore` / `FileLedgerStore` / `RoomLedger` / reducer → Task 2. ✓
- `canReview` + `isMergeReady` → Task 3. ✓
- Tracer-bullet integration test → Task 4. ✓
- Zod added to catalog → Task 1 Step 1. ✓
- Per-package Vitest tests → every task. ✓
- Validation runtime deferred, result schema in schemas (`Validation`, `ValidationCheck`) → Task 1. ✓
- `pnpm lint` + `pnpm -r type-check` + `pnpm -r test` gate → Task 4 Step 3. ✓

**Placeholder scan:** none — all code is complete; no TBD/TODO; the single `ponytail:` comment names a deliberate deferral with its upgrade path.

**Type consistency:** `RoomState | null` is consistent across `applyEvents`, `getState`, and `appendAndProject`. `LedgerEvent` value-vs-type imports use the `LedgerEvent` (value) / `LedgerEventType` (aliased type) split under `verbatimModuleSyntax`. Mutator method names (`createRoom`, `addParticipant`, `createTask`, `assignTask`, `setTaskStatus`, `recordReview`, `recordValidation`, `recordEscalation`) match between the Task 2 interface block, `ledger.ts`, and the Task 4 test. `MergeReadiness` shape `{ ready, reasons }` matches between Task 3 definition and both test files.
