# Tentacle Dual-Register — Advisor Loop (tracer bullet for #19)

**Status:** Proposed design (2026-06-22)
**Type:** First tracer-bullet slice of #19 (tiered-escalation / tentacle dual-register doctrine).
**Base:** `origin/main` @ `59f5254` (post-M11 composition milestone).

## Problem statement

Today the tentacle's escalation is single-shot. `scripts/orchestrate.ts` runs a fixed
linear chain (`assign → start → validate → skills → review → escalate? → deliver`), and
the only adaptive tiering that exists lives **inside ÆLLI's router**
(`aelli-router:workflow` classifies tier and runs generate→review→revise — see
`packages/agent-runtime/src/aelli-router-worker.ts`: *"the router classifies
tier/workflow from content"*). The tentacle itself is dumb: it sends a role-tagged prompt
and ÆLLI decides everything.

The #19 doctrine says the opposite — **coding-ness (and tiering) is a tentacle property,
not a router property.** The tentacle should own its own cheap→expensive loop, gated by
its own doctrine, with ÆLLI as a peer model provider rather than the loop-owner.

This slice proves the smallest end-to-end version of that: **before escalating to a
human, the tentacle tries a cheap advisor, gates it with an independent strong reviewer,
and re-dispatches to an expensive advisor only if the cheap one is rejected.** It moves
the cheap→expensive decision out of ÆLLI's router and into the tentacle, while reusing
octowiz's existing no-self-review and ledger machinery.

## Aligned decisions (2026-06-22)

1. **Slice = intra-tentacle dual-register** (one tentacle, one task). Cross-tentacle gate,
   emergent multi-step ReAct, and the tentacle-container interface are later slices.
2. **Register = advisor.** Build a **concrete, narrow advisor loop now** — *not* a generic
   `runTiered` primitive. The second caller (the coding register) doesn't exist yet and its
   needs (apply-patch seam, validation-not-review gate, structured outcomes) are unknown, so
   a generic interface would be speculative. Clean seams make later extraction trivial.
3. **Tiers via ÆLLI as a flat model gateway.** `[cheapModelId, expensiveModelId]` reached
   through a new flat gateway worker; ÆLLI is a model provider here, not the loop-owner.
   `aelli-router:workflow` is left untouched (still used by the existing router worker).
4. **observe = independent adversarial review verdict.** A strong reviewer (separate
   participant, `doctrine.canReview` enforced so reviewer ≠ advisor) judges each tier's
   output; its *verdict* drives the loop. Not model self-confidence — a model grading its
   own output would violate no-self-review. **Per-tier reviews are control-flow, not audit:
   they are NOT written as `review.recorded` events this slice** — only the final
   `advice.recorded` (approved) or `escalation.recorded` (exhausted) lands in the ledger.
   The `review` seam therefore *returns a verdict* rather than reusing `dispatchReview`
   (which writes a review event); it shares `doctrine.canReview` but not the ledger write.
5. **Reviewer is fixed-strong** across tiers — the quality anchor. A fixed-*cheap* reviewer
   would let a weak judge gatekeep expensive output, defeating the loop; a per-tier reviewer
   adds calls/control-flow for little gain since review is cheaper than generation and
   escalation is rare.
6. **Abort = tier-list exhaustion.** The tier list *is* the budget. On exhaustion still
   rejected → record an escalation to the ledger → human/senior takes over.
7. **Record approved advice too.** Add a clean new `advice.recorded` ledger event rather
   than overloading `escalation.recorded` (which would conflate "approved advice" with
   "needs higher attention").

## Proposed solution

### New components

**1. `createAelliGatewayWorker(modelId, config): AgentWorker`**
(`packages/agent-runtime/src/aelli-gateway-worker.ts`, exported from `index.ts`)

A flat-model worker, sibling to the existing `createAelliRouterWorker` (which is left
untouched). Sends the role-tagged prompt to the LiteLLM gateway's OpenAI-compatible
chat endpoint with an explicit `model` id, and returns `{ text }`.

```ts
export interface AelliGatewayWorkerConfig {
  baseUrl: string          // LiteLLM gateway, e.g. https://llm.integrahub.de/v1
  apiKey: string           // LITELLM_API_KEY
  fetchImpl?: typeof fetch
  timeoutMs?: number       // default 120_000
}

// POST {baseUrl}/chat/completions  { model: modelId, messages:[{role:'user',content:prompt}] }
// Fails closed (non-2xx / empty choice → throw), mirroring createAelliRouterWorker.
export function createAelliGatewayWorker(
  modelId: string,
  config: AelliGatewayWorkerConfig,
): AgentWorker
```

The concrete cheap/expensive model **aliases** (LiteLLM model ids) are configuration,
pinned during writing-plans (e.g. a small model for cheap, a strong model for expensive).
They are *not* hard-coded in the loop. The fixed-strong **reviewer** model is likewise a
config alias wired at the composition root, not in `tieredAdvise`.

**2. `tieredAdvise(args, deps): Promise<TieredAdviseResult>`**
(`packages/agent-runtime/src/tiered-advise.ts`, exported from `index.ts`)

The concrete dual-register loop. Seam-injected, unit-testable — same shape as the rest of
`agent-runtime`.

```ts
export interface TieredAdviseDeps {
  ledger: RoomLedger
  gatewayWorker: (modelId: string) => AgentWorker     // createAelliGatewayWorker(id, cfg) in prod
  review: (input: AdviceReviewInput) => Promise<ReviewVerdict>  // STRONG reviewer dispatch
  now: () => string
  newId: () => string
}

export interface TieredAdviseArgs {
  roomId: string
  taskId: string
  advisorId: string        // participant id of the advisor (role: advisor)
  reviewerId: string       // participant id of the fixed-strong reviewer (role: reviewer); MUST ≠ advisorId
  prompt: string
  tiers: string[]          // ordered model ids: [cheapId, expensiveId]
}

export type TieredAdviseResult =
  | { status: 'approved'; recommendation: string; tier: string }
  | { status: 'escalated'; recommendation: string }   // last (expensive) advice handed to human
```

### Data flow

```
guard: reviewerId ≠ advisorId            (no-self-review; throw if equal)

let lastOut
for modelId of tiers:                    # [cheapId, expensiveId]
  lastOut  = gatewayWorker(modelId)({ role: 'advisor', prompt })
  verdict  = review({ taskId, reviewerId, advisorId, candidate: lastOut.text })   # STRONG, fixed
  if verdict == 'approved':
     ledger.recordAdvice(roomId, { id:newId(), roomId, taskId, advisorId, reviewerId,
                                   tier: modelId, recommendation: lastOut.text,
                                   verdict, createdAt: now() }, now())
     return { status:'approved', recommendation: lastOut.text, tier: modelId }

# every tier exhausted, still rejected:
ledger.recordEscalation(roomId, { id:newId(), roomId, taskId,
   reason: 'all advisor tiers rejected by review',
   recommendation: lastOut.text, createdAt: now() }, now())
return { status:'escalated', recommendation: lastOut.text }
```

Cheap-approved is the common, cheap path; the expensive tier and the reviewer's strong
cost are only paid when the cheap advisor is rejected.

### Schema additions (`packages/schemas`)

New event + projection, parallel to the existing 10 event types:

```ts
export const AdviceSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  taskId: z.string().min(1),
  advisorId: z.string().min(1),
  reviewerId: z.string().min(1),
  tier: z.string().min(1),            // the model id that produced the accepted advice
  recommendation: z.string().min(1),
  verdict: z.literal('approved'),
  createdAt: z.string().min(1),
})
// LedgerEvent union gains: { type:'advice.recorded', advice: Advice }
// RoomState projection gains: advice: Advice[]
```

`RoomLedger` gains `recordAdvice(roomId, advice, at)`; the reducer handles
`advice.recorded` with the existing invariant style (unique advice id; task must exist).

### Entry point

A discrete CLI subcommand (mirrors M11's `assign` / `review` / `escalate` style), wired
through the existing `Deps` at the composition root:

```
octowiz advise --room R --task T --advisor A --reviewer Rv --tiers cheap-id,expensive-id [--prompt …]
```

`run-task` / `orchestrate.ts` is **left untouched** this slice — integrating the loop into
the main chain is a separate, later step.

## Error handling & doctrine

- **No-self-review across tiers:** the loop throws if `reviewerId == advisorId`, and the
  `review` seam enforces `doctrine.canReview`. The strong reviewer judges every tier.
- **Fail-closed:** any gateway or review seam rejection propagates *before* a ledger write,
  so a lost loop never looks resolved (matches `recordAelliEscalation`). `createAelliGatewayWorker`
  throws on non-2xx / empty output.
- **Abort:** the tier list is the budget — no token/clock cap this slice.
  `// ponytail: tier-list is the cap; add a token budget only if a tier ever loops.`
- **Ledger append-order contract (#9):** preserved — only new/existing reducers are called;
  "latest" stays append-order, never `createdAt`.

## Testing

Unit tests, fakes injected through the seams (scripted `gatewayWorker` keyed by model id,
scripted `review` verdicts, in-memory ledger store):

| Case | Assertion |
|---|---|
| cheap approved | returns `approved` with cheap rec; **expensive tier never dispatched**; `advice.recorded` written; no escalation |
| cheap rejected → expensive approved | returns `approved` with expensive rec; `advice.recorded` written; no escalation |
| both rejected | `escalation.recorded` written (reason + last/expensive rec); returns `escalated`; no `advice.recorded` |
| `reviewerId == advisorId` | throws (no-self-review); nothing written |
| gateway throws | propagates; nothing written |

Plus schema/reducer unit tests for `advice.recorded` (unique id, orphan-task rejection),
matching the existing event-type test pattern.

## Out of scope (explicit non-goals)

- **A2A / sibling / PEER topology.** ÆLLI here is a flat model proxy reached by model id —
  this slice does *not* exercise A2A or realize peer topology, despite the "ÆLLI = peer"
  framing of the broader doctrine.
- **Autonomous coding / the coding register.** No apply-patch/commit seam, no OpenCode
  auto-driving. The coding register (cheap coder → apply → validate → escalate) is a later
  slice that will reuse this loop's shape once an apply-patch seam exists.
- **The generic `runTiered` primitive.** Extracted only when the second caller (coding
  register) lands and its interface needs are known.
- **Cross-tentacle dependency-classifier gate** and **multi-step emergent ReAct** (Observe →
  re-dispatch beyond the fixed tier list). Later #19 slices.
- **`run-task` / `orchestrate.ts` integration** and any web panel for `advice.recorded`.

## Definition of done

- `createAelliGatewayWorker(modelId, config)` and `tieredAdvise(args, deps)` implemented in
  `agent-runtime`, exported, unit-green with the table above.
- `advice.recorded` event + `Advice` schema + `RoomLedger.recordAdvice` + reducer handling,
  unit-green.
- `advise` subcommand wired through `Deps` at the composition root.
- Full gate green: `pnpm lint`, `pnpm -r type-check`, `pnpm -r test`.
- No change to `aelli-router-worker.ts`, `orchestrate.ts`, or the existing acceptance test.
