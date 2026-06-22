# Tentacle Dual-Register Advisor Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before escalating to a human, the tentacle tries a cheap advisor, gates it with an independent strong reviewer, and re-dispatches to an expensive advisor only if the cheap one is rejected — recording approved advice and escalating on exhaustion.

**Architecture:** A concrete, narrow `tieredAdvise` loop in `@octowiz/agent-runtime` walks an ordered list of model ids, dispatching each through a flat ÆLLI-gateway worker and gating its output with an injected verdict-returning reviewer seam. Approved advice lands in the ledger via a new `advice.recorded` event; exhaustion records an `escalation.recorded` event. A discrete `advise` CLI subcommand wires it through the existing `Deps` composition root. No generic primitive, no A2A, no coding register.

**Tech Stack:** TypeScript (ESM), Zod schemas, Vitest, pnpm workspace, antfu ESLint config (no semicolons, single quotes, `import type`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-22-tentacle-dual-register-advisor-design.md` (commit `5d72243`).
- Style: antfu ESLint — **no semicolons, single quotes, `import type` for type-only imports, 2-space indent**. Match the surrounding files exactly.
- Pure core: time enters as a caller-supplied ISO string `at`; never call `new Date()` inside library functions (only the CLI entrypoint does).
- Fail closed: a ledger write happens only after every external seam (gateway, review) has answered; a seam rejection propagates and records nothing.
- No-self-review: the reviewer must be a different participant from both the task implementer (`canReview`) and the advisor (explicit guard).
- Ledger append-order contract (#9): only call existing/new reducers; never consult `createdAt` for "latest".
- Schema version stays `0.1.0`: `advice.recorded` is an additive union member (old ledgers still validate), so no version bump.
- Do NOT modify `aelli-router-worker.ts`, `scripts/orchestrate.ts`, or `scripts/acceptance.e2e.test.ts`.

---

### Task 1: `advice.recorded` ledger event (schema + reducer + facade)

**Files:**
- Modify: `packages/schemas/src/index.ts` (add `AdviceSchema`, union member, `RoomStateSchema.advice`)
- Modify: `packages/room-ledger/src/reducer.ts` (initial state + `advice.recorded` case)
- Modify: `packages/room-ledger/src/ledger.ts` (`recordAdvice` method)
- Test: `packages/room-ledger/src/reducer.test.ts` (append/reject cases)
- Test: `packages/room-ledger/src/ledger.test.ts` (facade projects advice)
- Modify (backfill `advice: []` — see Step 7): `packages/github-adapter/src/pr-body.test.ts`, `packages/doctrine/src/index.test.ts`, `packages/aelli-adapter/src/index.test.ts`, `packages/schemas/src/index.test.ts`, `apps/octowiz-web/test/status-badge.test.ts`, `apps/octowiz-web/test/escalation-panel.test.ts`

**Interfaces:**
- Produces: `Advice` type; `LedgerEvent` variant `{ type: 'advice.recorded', at: string, advice: Advice }`; `RoomState.advice: Advice[]`; `RoomLedger.recordAdvice(roomId: string, advice: Advice, at: string): Promise<RoomState>`.

- [ ] **Step 1: Write the failing reducer tests**

Add to `packages/room-ledger/src/reducer.test.ts` (match the file's existing import style and the `applyEvents` usage already there):

```ts
describe('advice.recorded', () => {
  const at = '2026-06-22T00:00:00.000Z'
  const room = { id: 'r1', name: 'Room', status: 'active' as const, createdAt: at }
  const task = { id: 't1', roomId: 'r1', title: 'Task', status: 'open' as const }
  const advice = {
    id: 'adv1', roomId: 'r1', taskId: 't1', advisorId: 'adv', reviewerId: 'rev',
    tier: 'cheap-model', recommendation: 'do X', verdict: 'approved' as const, createdAt: at,
  }

  it('appends advice for a known task', () => {
    const state = applyEvents([
      { type: 'room.created', at, room },
      { type: 'task.created', at, task },
      { type: 'advice.recorded', at, advice },
    ])
    expect(state?.advice).toEqual([advice])
  })

  it('rejects advice for an unknown task', () => {
    expect(() => applyEvents([
      { type: 'room.created', at, room },
      { type: 'advice.recorded', at, advice },
    ])).toThrow(/unknown task/)
  })

  it('rejects a duplicate advice id', () => {
    expect(() => applyEvents([
      { type: 'room.created', at, room },
      { type: 'task.created', at, task },
      { type: 'advice.recorded', at, advice },
      { type: 'advice.recorded', at, advice },
    ])).toThrow(/duplicate advice id/)
  })

  it('rejects advice whose roomId does not match the room', () => {
    expect(() => applyEvents([
      { type: 'room.created', at, room },
      { type: 'task.created', at, task },
      { type: 'advice.recorded', at, advice: { ...advice, roomId: 'other' } },
    ])).toThrow(/does not match room/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @octowiz/room-ledger exec vitest run src/reducer.test.ts`
Expected: FAIL — TypeScript/Zod errors that `advice.recorded` is not a known event type and `state.advice` does not exist.

- [ ] **Step 3: Add the schema**

In `packages/schemas/src/index.ts`, add `AdviceSchema` immediately after `EscalationSchema`/`export type Escalation` (around line 84):

```ts
export const AdviceSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  taskId: z.string().min(1),
  advisorId: z.string().min(1),
  reviewerId: z.string().min(1),
  tier: z.string().min(1), // the model id that produced the accepted advice
  recommendation: z.string().min(1),
  verdict: z.literal('approved'),
  createdAt: z.string().min(1),
})
export type Advice = z.infer<typeof AdviceSchema>
```

Add a union member to `LedgerEventSchema` (after the `escalation.recorded` line, ~line 96):

```ts
  z.object({ type: z.literal('advice.recorded'), at: z.string().min(1), advice: AdviceSchema }),
```

Add to `RoomStateSchema` (after the `escalations:` line, ~line 124):

```ts
  advice: z.array(AdviceSchema),
```

- [ ] **Step 4: Update the reducer**

In `packages/room-ledger/src/reducer.ts`, add `advice: []` to the initial state object (line 8):

```ts
    return { room: event.room, participants: [], tasks: [], reviews: [], validations: [], escalations: [], advice: [], sessions: [], sandboxes: [] }
```

Add a `case` inside the `switch` (place it right after the `escalation.recorded` case):

```ts
    case 'advice.recorded':
      if (event.advice.roomId !== state.room.id)
        throw new Error(`advice roomId "${event.advice.roomId}" does not match room "${state.room.id}"`)
      if (!hasTask(event.advice.taskId))
        throw new Error(`advice references unknown task "${event.advice.taskId}"`)
      if (state.advice.some(a => a.id === event.advice.id))
        throw new Error(`duplicate advice id "${event.advice.id}"`)
      return { ...state, advice: [...state.advice, event.advice] }
```

- [ ] **Step 5: Add the facade method**

In `packages/room-ledger/src/ledger.ts`, add `Advice` to the type import from `@octowiz/schemas` (keep the list alphabetised as the file does), then add the method after `recordEscalation` (~line 75):

```ts
  recordAdvice(roomId: string, advice: Advice, at: string): Promise<RoomState> {
    return this.appendAndProject(roomId, { type: 'advice.recorded', at, advice })
  }
```

- [ ] **Step 6: Write the facade test**

Add to `packages/room-ledger/src/ledger.test.ts` (reuse the file's existing in-memory store / setup helpers; if it seeds a room+task, follow that; otherwise create room `r1` + task `t1` first):

```ts
it('recordAdvice projects approved advice into room state', async () => {
  const at = '2026-06-22T00:00:00.000Z'
  const ledger = new RoomLedger(memoryStore())
  await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: at }, at)
  await ledger.createTask({ id: 't1', roomId: 'r1', title: 'Task', status: 'open' }, at)
  const state = await ledger.recordAdvice('r1', {
    id: 'adv1', roomId: 'r1', taskId: 't1', advisorId: 'adv', reviewerId: 'rev',
    tier: 'cheap-model', recommendation: 'do X', verdict: 'approved', createdAt: at,
  }, at)
  expect(state.advice).toHaveLength(1)
  expect(state.advice[0]?.tier).toBe('cheap-model')
})
```

> If `ledger.test.ts` does not already define a `memoryStore()` helper, copy the one from `packages/agent-runtime/src/index.test.ts` (the `Map<string, LedgerEvent[]>` implementation) into the test file.

- [ ] **Step 7: Backfill `advice: []` into existing `RoomState` literals**

Making `advice` a required field of `RoomState` breaks every full `RoomState` object literal in the repo under `pnpm -r type-check`. Add `advice: [],` to each (place it next to the existing `escalations: [],` line). The known literals:

- `packages/github-adapter/src/pr-body.test.ts`
- `packages/doctrine/src/index.test.ts`
- `packages/aelli-adapter/src/index.test.ts`
- `packages/schemas/src/index.test.ts`
- `apps/octowiz-web/test/status-badge.test.ts`
- `apps/octowiz-web/test/escalation-panel.test.ts`

Example edit (apply the same shape in each file):

```ts
    escalations: [],
    advice: [],
    sessions: [],
```

Then run a repo-wide type-check to catch any literal not in the list above:

Run: `pnpm -r type-check`
Expected: PASS. If it flags another `RoomState` literal missing `advice`, add `advice: []` there too — do NOT widen scope beyond satisfying the compiler (no defensive refactors).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @octowiz/room-ledger exec vitest run src/reducer.test.ts src/ledger.test.ts`
Expected: PASS (all advice cases green).
Then: `pnpm --filter @octowiz/schemas exec vitest run` — Expected: PASS (no schema regressions).
Then: `pnpm -r test` — Expected: PASS (the backfilled literals keep github-adapter / doctrine / aelli-adapter / web tests green).

- [ ] **Step 9: Commit**

```bash
git add packages/schemas/src/index.ts packages/room-ledger/src/reducer.ts packages/room-ledger/src/ledger.ts packages/room-ledger/src/reducer.test.ts packages/room-ledger/src/ledger.test.ts packages/github-adapter/src/pr-body.test.ts packages/doctrine/src/index.test.ts packages/aelli-adapter/src/index.test.ts packages/schemas/src/index.test.ts apps/octowiz-web/test/status-badge.test.ts apps/octowiz-web/test/escalation-panel.test.ts
git commit -m "feat(schemas,room-ledger): advice.recorded ledger event"
```

---

### Task 2: `createAelliGatewayWorker` (flat ÆLLI model gateway)

**Files:**
- Create: `packages/agent-runtime/src/aelli-gateway-worker.ts`
- Modify: `packages/agent-runtime/src/index.ts` (re-export)
- Test: `packages/agent-runtime/src/aelli-gateway-worker.test.ts`

**Interfaces:**
- Consumes: `AgentWorker` type from `./index`.
- Produces: `createAelliGatewayWorker(modelId: string, config: AelliGatewayWorkerConfig): AgentWorker`; `AelliGatewayWorkerConfig` (`{ baseUrl, apiKey, fetchImpl?, timeoutMs? }`).

- [ ] **Step 1: Write the failing test**

Create `packages/agent-runtime/src/aelli-gateway-worker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAelliGatewayWorker } from './aelli-gateway-worker'

function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createAelliGatewayWorker', () => {
  const config = { baseUrl: 'https://gw.example/v1', apiKey: 'k' }

  it('posts model + prompt to /chat/completions and returns the content', async () => {
    const fetchImpl = vi.fn(async () => okResponse('the advice'))
    const worker = createAelliGatewayWorker('cheap-model', { ...config, fetchImpl })
    const out = await worker({ role: 'advisor', prompt: 'help' })
    expect(out.text).toBe('the advice')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://gw.example/v1/chat/completions')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe('cheap-model')
    expect(body.messages).toEqual([{ role: 'user', content: 'help' }])
  })

  it('throws on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    const worker = createAelliGatewayWorker('cheap-model', { ...config, fetchImpl })
    await expect(worker({ role: 'advisor', prompt: 'help' })).rejects.toThrow(/500/)
  })

  it('throws on empty content', async () => {
    const fetchImpl = vi.fn(async () => okResponse('   '))
    const worker = createAelliGatewayWorker('cheap-model', { ...config, fetchImpl })
    await expect(worker({ role: 'advisor', prompt: 'help' })).rejects.toThrow(/no output/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @octowiz/agent-runtime exec vitest run src/aelli-gateway-worker.test.ts`
Expected: FAIL — `Cannot find module './aelli-gateway-worker'`.

- [ ] **Step 3: Write the implementation**

Create `packages/agent-runtime/src/aelli-gateway-worker.ts`:

```ts
import type { AgentWorker } from './index'

/**
 * Config for the flat-model worker: call ÆLLI's LiteLLM gateway as a plain
 * OpenAI-compatible chat endpoint with an explicit model id. Sibling to
 * `createAelliRouterWorker` (which drives the router WORKFLOW); this one is a flat model
 * proxy so the tentacle — not the router — owns the cheap→expensive loop.
 */
export interface AelliGatewayWorkerConfig {
  /** LiteLLM chat root, e.g. `https://llm.integrahub.de/v1` (keep the `/v1`). */
  baseUrl: string
  /** LiteLLM-gateway bearer token (`LITELLM_API_KEY`). */
  apiKey: string
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Request timeout in ms. A single flat call, so default 2 min. */
  timeoutMs?: number
}

interface ChatCompletion {
  choices?: { message?: { content?: unknown } }[]
}

/**
 * Build an `AgentWorker` backed by one flat chat completion against `modelId`. The
 * advisor `role` is not sent (a flat model call has no role routing); only the prompt
 * travels. Fails closed like `createAelliRouterWorker`: a non-2xx or an empty/non-string
 * content throws, so a missing answer never looks like a successful dispatch.
 */
export function createAelliGatewayWorker(modelId: string, config: AelliGatewayWorkerConfig): AgentWorker {
  const fetchImpl = config.fetchImpl ?? fetch
  const timeoutMs = config.timeoutMs ?? 120_000
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`

  return async ({ prompt }) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok)
      throw new Error(`ÆLLI gateway call failed: ${res.status} ${res.statusText}`)

    const body = await res.json() as ChatCompletion
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim() === '')
      throw new Error(`ÆLLI gateway model "${modelId}" produced no output`)
    return { text: content }
  }
}
```

- [ ] **Step 4: Re-export from the package barrel**

In `packages/agent-runtime/src/index.ts`, add after the existing `aelli-router-worker` re-export (line 6):

```ts
export { type AelliGatewayWorkerConfig, createAelliGatewayWorker } from './aelli-gateway-worker'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @octowiz/agent-runtime exec vitest run src/aelli-gateway-worker.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add packages/agent-runtime/src/aelli-gateway-worker.ts packages/agent-runtime/src/aelli-gateway-worker.test.ts packages/agent-runtime/src/index.ts
git commit -m "feat(agent-runtime): createAelliGatewayWorker flat model worker"
```

---

### Task 3: `tieredAdvise` (the dual-register loop)

**Files:**
- Create: `packages/agent-runtime/src/tiered-advise.ts`
- Modify: `packages/agent-runtime/src/index.ts` (re-export)
- Test: `packages/agent-runtime/src/tiered-advise.test.ts`

**Interfaces:**
- Consumes: `RoomLedger` (`@octowiz/room-ledger`, with `recordAdvice` from Task 1); `canReview` (`@octowiz/doctrine`); `ReviewVerdict` (`@octowiz/schemas`); `AgentWorker` (`./index`).
- Produces:
  - `AdviceReviewInput` = `{ taskId: string, prompt: string, candidate: string }`
  - `AdviceReviewer` = `(input: AdviceReviewInput) => Promise<ReviewVerdict>`
  - `TieredAdviseDeps` = `{ ledger: RoomLedger, gatewayWorker: (modelId: string) => AgentWorker, review: AdviceReviewer }`
  - `TieredAdviseArgs` = `{ roomId, taskId, advisorId, reviewerId, prompt, tiers: string[], at: string }`
  - `TieredAdviseResult` = `{ status: 'approved', recommendation: string, tier: string } | { status: 'escalated', recommendation: string }`
  - `tieredAdvise(args: TieredAdviseArgs, deps: TieredAdviseDeps): Promise<TieredAdviseResult>`

- [ ] **Step 1: Write the failing tests**

Create `packages/agent-runtime/src/tiered-advise.test.ts`:

```ts
import type { LedgerStore } from '@octowiz/room-ledger'
import type { LedgerEvent } from '@octowiz/schemas'
import type { AdviceReviewer } from './tiered-advise'
import type { AgentWorker } from './index'
import { RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it } from 'vitest'
import { tieredAdvise } from './tiered-advise'

const at = '2026-06-22T00:00:00.000Z'

function memoryStore(): LedgerStore {
  const logs = new Map<string, LedgerEvent[]>()
  return {
    async appendEvent(roomId, event) {
      const events = logs.get(roomId) ?? []
      events.push(event)
      logs.set(roomId, events)
    },
    async readEvents(roomId) {
      return [...(logs.get(roomId) ?? [])]
    },
    async listRooms() {
      return [...logs.keys()]
    },
  }
}

// Seeds a room + task + a reviewer participant (reviewer role, not the implementer), so
// canReview passes. The advisor need not be a registered participant for tieredAdvise.
async function seed(): Promise<RoomLedger> {
  const ledger = new RoomLedger(memoryStore())
  await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: at }, at)
  await ledger.addParticipant('r1', { id: 'rev', kind: 'agent', roles: ['reviewer'], displayName: 'Reviewer' }, at)
  await ledger.createTask({ id: 't1', roomId: 'r1', title: 'Task', status: 'open' }, at)
  return ledger
}

// A gatewayWorker factory whose output depends on the model id, recording dispatched tiers.
function workerFactory(dispatched: string[]): (modelId: string) => AgentWorker {
  return modelId => async ({ prompt: _prompt }) => {
    dispatched.push(modelId)
    return { text: `${modelId} says: do the thing` }
  }
}

const baseArgs = {
  roomId: 'r1', taskId: 't1', advisorId: 'adv', reviewerId: 'rev',
  prompt: 'how do I X?', tiers: ['cheap', 'expensive'], at,
}

describe('tieredAdvise', () => {
  it('returns the cheap recommendation and never dispatches the expensive tier when cheap is approved', async () => {
    const ledger = await seed()
    const dispatched: string[] = []
    const review: AdviceReviewer = async () => 'approved'
    const result = await tieredAdvise(baseArgs, { ledger, gatewayWorker: workerFactory(dispatched), review })
    expect(result).toEqual({ status: 'approved', recommendation: 'cheap says: do the thing', tier: 'cheap' })
    expect(dispatched).toEqual(['cheap'])
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(1)
    expect(state?.escalations).toHaveLength(0)
  })

  it('escalates to the expensive tier when cheap is rejected, then approves', async () => {
    const ledger = await seed()
    const dispatched: string[] = []
    // Call-counter closure (not vi.fn<T>()) — annotating `: AdviceReviewer` types the literals
    // as ReviewVerdict and matches the repo's inferred vi.fn style.
    let calls = 0
    const review: AdviceReviewer = async () => (calls++ === 0 ? 'rejected' : 'approved')
    const result = await tieredAdvise(baseArgs, { ledger, gatewayWorker: workerFactory(dispatched), review })
    expect(result).toEqual({ status: 'approved', recommendation: 'expensive says: do the thing', tier: 'expensive' })
    expect(dispatched).toEqual(['cheap', 'expensive'])
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(1)
    expect(state?.advice[0]?.tier).toBe('expensive')
  })

  it('records an escalation with the last recommendation when all tiers are rejected', async () => {
    const ledger = await seed()
    const dispatched: string[] = []
    const review: AdviceReviewer = async () => 'rejected'
    const result = await tieredAdvise(baseArgs, { ledger, gatewayWorker: workerFactory(dispatched), review })
    expect(result).toEqual({ status: 'escalated', recommendation: 'expensive says: do the thing' })
    expect(dispatched).toEqual(['cheap', 'expensive'])
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(0)
    expect(state?.escalations).toHaveLength(1)
    expect(state?.escalations[0]?.reason).toMatch(/all advisor tiers rejected/)
    expect(state?.escalations[0]?.recommendation).toBe('expensive says: do the thing')
  })

  it('throws when the reviewer is the advisor (no self-review), recording nothing', async () => {
    const ledger = await seed()
    const dispatched: string[] = []
    const review: AdviceReviewer = async () => 'approved'
    await expect(tieredAdvise(
      { ...baseArgs, reviewerId: 'adv' },
      { ledger, gatewayWorker: workerFactory(dispatched), review },
    )).rejects.toThrow(/no self-review/)
    expect(dispatched).toEqual([])
  })

  it('propagates a gateway failure and records nothing', async () => {
    const ledger = await seed()
    const review: AdviceReviewer = async () => 'approved'
    const gatewayWorker = (): AgentWorker => async () => { throw new Error('gateway down') }
    await expect(tieredAdvise(baseArgs, { ledger, gatewayWorker, review })).rejects.toThrow(/gateway down/)
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(0)
    expect(state?.escalations).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @octowiz/agent-runtime exec vitest run src/tiered-advise.test.ts`
Expected: FAIL — `Cannot find module './tiered-advise'`.

- [ ] **Step 3: Write the implementation**

Create `packages/agent-runtime/src/tiered-advise.ts`:

```ts
import type { RoomLedger } from '@octowiz/room-ledger'
import type { ReviewVerdict } from '@octowiz/schemas'
import type { AgentWorker } from './index'
import { canReview } from '@octowiz/doctrine'

/** What the reviewer seam judges: the advisor's task prompt and its candidate output. */
export interface AdviceReviewInput {
  taskId: string
  prompt: string
  candidate: string
}

/**
 * The injected reviewer seam: judge a candidate recommendation and return a verdict. It
 * returns a verdict for loop control and does NOT write a `review.recorded` event — per-tier
 * reviews are control-flow, not audit, this slice. Shares the no-self-review doctrine
 * (`canReview`, enforced by `tieredAdvise`) but not `dispatchReview`'s ledger write.
 */
export type AdviceReviewer = (input: AdviceReviewInput) => Promise<ReviewVerdict>

export interface TieredAdviseDeps {
  ledger: RoomLedger
  gatewayWorker: (modelId: string) => AgentWorker
  review: AdviceReviewer
}

export interface TieredAdviseArgs {
  roomId: string
  taskId: string
  advisorId: string
  reviewerId: string
  prompt: string
  /** Ordered model ids, cheapest first, e.g. ['cheap-model', 'expensive-model']. */
  tiers: string[]
  /** Caller-supplied ISO timestamp (pure core). */
  at: string
}

export type TieredAdviseResult =
  | { status: 'approved', recommendation: string, tier: string }
  | { status: 'escalated', recommendation: string }

/**
 * The intra-tentacle dual-register advisor loop: walk `tiers` cheapest-first, dispatching
 * each through the flat gateway worker and gating its output with the strong reviewer. The
 * first approved tier is recorded as `advice.recorded` and returned. If every tier is
 * rejected, the last (most expensive) recommendation is escalated to the ledger for a human.
 *
 * Fails closed: a ledger write happens only after the gateway and review seams answer, so a
 * seam rejection propagates and records nothing.
 */
export async function tieredAdvise(args: TieredAdviseArgs, deps: TieredAdviseDeps): Promise<TieredAdviseResult> {
  const { roomId, taskId, advisorId, reviewerId, prompt, tiers, at } = args
  const { ledger, gatewayWorker, review } = deps

  if (tiers.length === 0)
    throw new Error('tieredAdvise requires at least one tier')
  // No self-review: canReview only excludes the task IMPLEMENTER, so the advisor≠reviewer
  // case (the advisor judging its own advice) must be guarded explicitly.
  if (reviewerId === advisorId)
    throw new Error(`reviewer "${reviewerId}" may not review advisor "${advisorId}" (no self-review)`)

  const state = await ledger.getState(roomId)
  if (state === null)
    throw new Error(`room "${roomId}" has no state`)
  if (!canReview(state, taskId, reviewerId))
    throw new Error(`"${reviewerId}" may not review task "${taskId}" (no self-review)`)

  let lastText = ''
  for (const tier of tiers) {
    const out = await gatewayWorker(tier)({ role: 'advisor', prompt })
    lastText = out.text
    const verdict = await review({ taskId, prompt, candidate: out.text })
    if (verdict === 'approved') {
      await ledger.recordAdvice(
        roomId,
        { id: `adv-${roomId}-${taskId}-${tier}-${at}`, roomId, taskId, advisorId, reviewerId, tier, recommendation: out.text, verdict: 'approved', createdAt: at },
        at,
      )
      return { status: 'approved', recommendation: out.text, tier }
    }
  }

  // Every tier was rejected — escalate the last (most expensive) advice to a human.
  await ledger.recordEscalation(
    roomId,
    { id: `esc-${roomId}-${taskId}-${at}`, roomId, taskId, reason: 'all advisor tiers rejected by review', recommendation: lastText, createdAt: at },
    at,
  )
  return { status: 'escalated', recommendation: lastText }
}
```

- [ ] **Step 4: Re-export from the package barrel**

In `packages/agent-runtime/src/index.ts`, add after the `createAelliGatewayWorker` re-export from Task 2:

```ts
export { type AdviceReviewer, type AdviceReviewInput, type TieredAdviseArgs, type TieredAdviseDeps, type TieredAdviseResult, tieredAdvise } from './tiered-advise'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @octowiz/agent-runtime exec vitest run src/tiered-advise.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 6: Commit**

```bash
git add packages/agent-runtime/src/tiered-advise.ts packages/agent-runtime/src/tiered-advise.test.ts packages/agent-runtime/src/index.ts
git commit -m "feat(agent-runtime): tieredAdvise dual-register advisor loop"
```

---

### Task 4: `advise` CLI subcommand + composition wiring

**Files:**
- Modify: `scripts/octowiz.ts` (`Deps` fields, `parseArgs` options, `advise` case, entrypoint wiring, error text)
- Test: `scripts/octowiz.test.ts` (advise subcommand cases)

**Interfaces:**
- Consumes: `tieredAdvise`, `createAelliGatewayWorker`, `AdviceReviewer` (`@octowiz/agent-runtime`); `AgentWorker` type; `ReviewVerdictSchema` (already imported).
- Produces: `Deps.gatewayWorker?: (modelId: string) => AgentWorker`; `Deps.review?: AdviceReviewer`; the `advise` subcommand `advise --room R --task T --advisor A --reviewer Rv --tiers cheap,expensive [--prompt …]`.

- [ ] **Step 1: Write the failing test**

Add to `scripts/octowiz.test.ts` (reuse the file's existing `runCli` import and its Deps-building helper; the snippet below builds a minimal `deps` inline — adapt to the file's existing helper if one exists, adding `gatewayWorker` + `review`):

```ts
describe('advise subcommand', () => {
  const at0 = '2026-06-22T00:00:00.000Z'

  async function adviseDeps(reviewVerdict: 'approved' | 'rejected') {
    const ledger = new RoomLedger(memoryStore())
    let clock = 0
    const now = () => `2026-06-22T00:00:${String(clock++).padStart(2, '0')}.000Z`
    await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: at0 }, at0)
    await ledger.createTask({ id: 't1', roomId: 'r1', title: 'Task', status: 'open' }, at0)
    const dispatched: string[] = []
    const deps = {
      ledger,
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
      now,
      provider: { name: 'fake', create: async () => ({ provider: 'fake', id: 'sbx', roomId: 'r1' }), destroy: async () => {} },
      worker: async ({ role }: { role: string }) => ({ text: `${role}: ok` }),
      aelliClient: async () => 'aelli',
      readFile: async () => '{"schemaVersion":"0.1.0","skills":[]}',
      skillRegistryPath: 'skills/registry.json',
      checks: [],
      gatewayWorker: (modelId: string) => async () => { dispatched.push(modelId); return { text: `${modelId}: advice` } },
      review: async () => reviewVerdict,
    }
    return { ledger, deps, dispatched }
  }

  it('records advice when the cheap tier is approved', async () => {
    const { ledger, deps, dispatched } = await adviseDeps('approved')
    await runCli(['advise', '--room', 'r1', '--task', 't1', '--advisor', 'adv', '--reviewer', 'rev', '--tiers', 'cheap,expensive'], deps as never)
    expect(dispatched).toEqual(['cheap'])
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(1)
  })

  it('escalates when all tiers are rejected', async () => {
    const { ledger, deps } = await adviseDeps('rejected')
    await runCli(['advise', '--room', 'r1', '--task', 't1', '--advisor', 'adv', '--reviewer', 'rev', '--tiers', 'cheap,expensive'], deps as never)
    const state = await ledger.getState('r1')
    expect(state?.escalations).toHaveLength(1)
  })

  it('rejects --advisor equal to --reviewer', async () => {
    const { deps } = await adviseDeps('approved')
    await expect(runCli(['advise', '--room', 'r1', '--task', 't1', '--advisor', 'x', '--reviewer', 'x', '--tiers', 'cheap'], deps as never))
      .rejects.toThrow(/no self-review/)
  })
})
```

> If `scripts/octowiz.test.ts` lacks a `memoryStore()` helper, copy it from `packages/agent-runtime/src/index.test.ts`. The `as never` casts keep the inline `deps` literal terse; if the file has a typed Deps factory, prefer extending that instead.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/octowiz.test.ts -t advise`
Expected: FAIL — `unknown subcommand: advise`.

- [ ] **Step 3: Extend the `Deps` interface and `parseArgs` options**

In `scripts/octowiz.ts`:

Add the two imports — extend the `@octowiz/agent-runtime` import (line 12) to include `createAelliGatewayWorker, tieredAdvise`, and add a type import:

```ts
import type { AdviceReviewer, AgentWorker } from '@octowiz/agent-runtime'
```
```ts
import { createAelliGatewayWorker, createAelliRouterWorker, createLocalModelWorker, dispatchReview, tieredAdvise } from '@octowiz/agent-runtime'
```

Add to the `Deps` interface (after `checks: Check[]`, ~line 40):

```ts
  // ponytail: optional — consumed only by the `advise` subcommand, unlike `worker` which is
  // used broadly. Required would force every existing Deps literal in tests to add them for
  // no benefit. The `advise` case throws if they are absent.
  gatewayWorker?: (modelId: string) => AgentWorker
  review?: AdviceReviewer
```

Add three options to the `parseArgs` `options` object (~line 77):

```ts
      advisor: { type: 'string' },
      tiers: { type: 'string' },
      prompt: { type: 'string' },
```

Add `gatewayWorker, review` to the `deps` destructure (~line 74):

```ts
  const { ledger, run, now, provider, worker, aelliClient, readFile, skillRegistryPath, checks = DEFAULT_CHECKS, gatewayWorker, review } = deps
```

- [ ] **Step 4: Add the `advise` case**

Insert a new `case 'advise'` in the `switch` (place it after the `review` case, before `deliver`):

```ts
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
      // Fail fast on unknown room/task (mirror review/assign).
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      if (!state.tasks.some(t => t.id === taskId))
        throw new Error(`task "${taskId}" not found in room "${roomId}"`)
      // Register advisor + reviewer idempotently with role guards — the ledger has no
      // role-update event, so a same-id participant lacking the needed agent role can't be
      // promoted: fail loudly instead of a misleading downstream "no self-review" error.
      const existingAdvisor = state.participants.find(p => p.id === advisorId)
      if (existingAdvisor !== undefined && (existingAdvisor.kind !== 'agent' || !existingAdvisor.roles.includes('advisor')))
        throw new Error(`cannot advise: participant "${advisorId}" already exists without the agent advisor role`)
      if (existingAdvisor === undefined)
        await ledger.addParticipant(roomId, { id: advisorId, kind: 'agent', roles: ['advisor'], displayName: advisorId }, now())
      const existingReviewer = state.participants.find(p => p.id === reviewerId)
      if (existingReviewer !== undefined && (existingReviewer.kind !== 'agent' || !existingReviewer.roles.includes('reviewer')))
        throw new Error(`cannot advise: participant "${reviewerId}" already exists without the agent reviewer role`)
      if (existingReviewer === undefined)
        await ledger.addParticipant(roomId, { id: reviewerId, kind: 'agent', roles: ['reviewer'], displayName: reviewerId }, now())
      const result = await tieredAdvise({ roomId, taskId, advisorId, reviewerId, prompt, tiers, at: now() }, { ledger, gatewayWorker, review })
      console.log(result.status === 'approved' ? `advice approved at tier ${result.tier}` : 'advice escalated (all tiers rejected)')
      const final = await ledger.getState(roomId)
      if (final === null)
        throw new Error(`room "${roomId}" not found`)
      return final
    }
```

Update the `default` error message (~line 298) to list `advise`:

```ts
      throw new Error(`unknown subcommand: ${subcommand ?? '(none)'} (expected create-room | create-task | start | validate | status | up | assign | escalate | review | skills | deliver | run-task | advise)`)
```

- [ ] **Step 5: Wire the real seams in the entrypoint**

In the `if (import.meta.url === ...)` entrypoint block, after the `aelliClient` wiring (~line 323), add:

```ts
  // Flat gateway worker: the tentacle owns the cheap→expensive loop, calling ÆLLI as a plain
  // model proxy. Uses the chat root (LITELLM_BASE_URL keeps its `/v1`), NOT the stripped A2A base.
  const gatewayWorker = (modelId: string): AgentWorker => {
    if (!process.env.LITELLM_BASE_URL || !aelliApiKey)
      throw new Error('ÆLLI gateway not configured: set LITELLM_BASE_URL and LITELLM_API_KEY')
    return createAelliGatewayWorker(modelId, { baseUrl: process.env.LITELLM_BASE_URL, apiKey: aelliApiKey })
  }
  // The strong reviewer: ask a fixed reviewer model for a one-word verdict and parse it.
  // Fail safe — an unparseable verdict counts as not-approved so the loop escalates rather
  // than silently accepting unreviewed output. Deriving a richer verdict is a later slice.
  const reviewerModelId = process.env.OCTOWIZ_REVIEWER_MODEL ?? 'octowiz-reviewer'
  const review: AdviceReviewer = async ({ prompt, candidate }) => {
    const reviewPrompt = `You are an independent reviewer. Task:\n${prompt}\n\nCandidate recommendation:\n${candidate}\n\nReply with exactly one word: approved, rejected, or changes_requested.`
    const out = await gatewayWorker(reviewerModelId)({ role: 'reviewer', prompt: reviewPrompt })
    const parsed = ReviewVerdictSchema.safeParse(out.text.trim().toLowerCase())
    return parsed.success ? parsed.data : 'rejected'
  }
```

Add `gatewayWorker` and `review` to the `runCli(argv, { … })` deps object (~line 333):

```ts
    gatewayWorker,
    review,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/octowiz.test.ts -t advise`
Expected: PASS (all three advise cases).

- [ ] **Step 7: Commit**

```bash
git add scripts/octowiz.ts scripts/octowiz.test.ts
git commit -m "feat(cli): advise subcommand wiring the tiered advisor loop"
```

---

### Final gate

- [ ] **Step 1: Run the full gate**

Run: `pnpm lint && pnpm -r type-check && pnpm -r test`
Expected: PASS across all packages. If lint flags style (semicolons/quotes), fix to match antfu config and re-run.

- [ ] **Step 2: Confirm no out-of-scope files changed**

Run: `git diff --stat origin/main` — Expected: `packages/schemas`, `packages/room-ledger`, `packages/agent-runtime`, `scripts/octowiz.*`, and the `advice: []` backfill in the six `RoomState`-literal test files (github-adapter / doctrine / aelli-adapter / schemas / two web tests), plus this plan/spec. `aelli-router-worker.ts`, `scripts/orchestrate.ts`, and `scripts/acceptance.e2e.test.ts` must be untouched.

## Self-Review notes (plan author)

- **Spec coverage:** gateway worker (Task 2) ✓; tiered loop + observe-via-review + abort→escalation (Task 3) ✓; `advice.recorded` audit event (Task 1) ✓; `advise` subcommand + ÆLLI-as-flat-gateway wiring (Task 4) ✓; fixed-strong reviewer (entrypoint `reviewerModelId`, Task 4) ✓; no-self-review across tiers (Task 3 guard + canReview) ✓. Non-goals (A2A/PEER, coding register, generic primitive, orchestrate integration) are respected — no task touches them.
- **Reconciliation:** the spec's "review seam shares canReview" is realized by `tieredAdvise` performing the `canReview` check itself (it holds the ledger/state), exactly as `dispatchReview` does — the `review` seam stays a pure verdict function.
- **Type consistency:** `AgentWorker`, `ReviewVerdict`, `RoomLedger.recordAdvice`, `Advice` names match across Tasks 1–4.
- **Cross-repo schema ripple (checked):** making `advice` required on `RoomState` breaks every full `RoomState` literal repo-wide — six were located by grep (`escalations: []` / `sandboxes: []` markers) and folded into Task 1 Step 7, with a `pnpm -r type-check` catch-all for any straggler. `LedgerEvent` gained `advice.recorded`, but the only exhaustive switch over event `type` is the reducer's (no `default`), handled in Step 4; a grep found no other `*.recorded` switch. vitest 4.1.9: Task 3 avoids `vi.fn<T>()` in favor of a typed call-counter closure.
