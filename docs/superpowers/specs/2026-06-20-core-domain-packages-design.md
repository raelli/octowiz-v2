# Core Domain Packages — Design Spec

- **Date:** 2026-06-20
- **Status:** Approved (brainstorming) — ready for implementation plan
- **Slice:** First buildable slice of MVP Milestone 3 (Core Domain Packages). Covers the
  domain **spine**: `packages/schemas` + `packages/room-ledger` built for real, with
  `packages/doctrine` thin-but-real. `packages/validation` runtime is deferred to a
  follow-up slice.

## Goal

Stand up the persistent domain core of octowiz-v2: a shared, versioned schema vocabulary
(rooms, tasks, participants, reviews, validations, escalations), an event-sourced room
ledger backed by plain files behind a storage interface, and the two load-bearing
doctrine rules (no self-review, merge-readiness) — proven end-to-end by a tracer-bullet
flow that creates a room, adds a participant and a task, records a review and a
validation, persists to disk, reads it back, and evaluates merge-readiness.

This is a **vertical tracer bullet through the domain layer**, not a horizontal
package-by-package build. There is no UI (CLI-first direction; web is Milestone 10) and
no Zellij/OpenCode wiring (Milestone 4) — the slice cuts create → persist → read →
evaluate through schema, storage, and doctrine together.

## Non-Goals

Explicitly deferred to later slices:

- **`packages/validation` runtime** — running configured checks and parsing results is
  meaningful only once the room/sandbox flow exists (Milestone 4+). Its *result schema*
  ships now (in `schemas`) so the ledger can already record externally-produced
  validation outcomes. No empty `packages/validation` is scaffolded.
- **PR metadata schema** — lands with `packages/github-adapter` (Milestone 8).
- **Waiver rules** in doctrine — marked with a `ponytail:` upgrade-path comment.
- **Snapshot/cache files** in the ledger — state is derived by folding the event log on
  read; a cache is added only if replay is measurably slow.
- **Branded ID types, schema migrations** — YAGNI for the spine; plain string IDs and a
  single `SCHEMAS_VERSION` constant.
- **SQLite storage** — file-based is local-first, dependency-free, and inspectable; the
  `LedgerStore` interface keeps SQLite a drop-in later without touching callers.

## Approach

**Event-sourced, file-backed, Zod-validated.** The room ledger is an append-only event
log; current room state is a pure fold (reducer) over events. Storage hides behind a
`LedgerStore` interface so the file backend is replaceable. Schemas use **Zod** (chosen
over Valibot — ubiquitous, best TS inference, ecosystem; bundle size is irrelevant for
backend domain packages). Doctrine is pure functions over schema types and projected
state.

Alternatives considered and rejected for this slice:

- **State-oriented storage (read/modify/write a `room.json`)** — simpler to write but
  loses decision/review/validation/escalation *history*, which the ledger must keep
  (see `docs/packages.md`). Event sourcing gives history for free and makes the reducer
  the single testable core.
- **All four packages in one PR** — larger, harder-to-review diff; doctrine/validation
  depth is better proven on top of a working spine.
- **Valibot** — smaller bundle, but no benefit here and a smaller ecosystem.

## Design

### 1. `packages/schemas` (Zod)

The shared, versioned vocabulary. Scoped to what the spine persists and projects.

Entities (each a Zod schema + inferred type):

- **`Participant`** — `id`, `kind` (`human` | `agent`), `roles` (subset of
  `implementer` | `reviewer` | `validator` | `advisor` | `steward`), `displayName`.
- **`Room`** — `id`, `name`, `status` (`active` | `archived`), `createdAt`.
- **`Task`** — `id`, `roomId`, `title`, `description?`, `status` (`open` |
  `in_progress` | `in_review` | `validated` | `merged` | `blocked`), `implementerId?`.
- **`Review`** — `id`, `taskId`, `reviewerId`, `verdict` (`approved` | `rejected` |
  `changes_requested`), `notes?`, `createdAt`.
- **`Validation`** — `id`, `taskId`, `status` (`passed` | `failed`),
  `checks` (array of `{ name, status, output? }`), `createdAt`.
- **`Escalation`** — `id`, `roomId`, `taskId?`, `reason`, `recommendation?`,
  `createdAt`.

`LedgerEvent` — a discriminated union on `type`, every variant carrying `at` (ISO
timestamp string, passed in by the caller — no `Date.now()` inside pure code):

- `room.created` → `{ room }`
- `participant.joined` → `{ participant }`
- `task.created` → `{ task }`
- `task.status_changed` → `{ taskId, status }`
- `task.assigned` → `{ taskId, implementerId }`
- `review.recorded` → `{ review }`
- `validation.recorded` → `{ validation }`
- `escalation.recorded` → `{ escalation }`

`RoomState` — the projection shape: `{ room, participants, tasks, reviews, validations,
escalations }`.

`SCHEMAS_VERSION` bumped `0.0.0` → `0.1.0`, exported and stamped into persisted data so
old logs are detectable later.

**Trust boundary:** schemas are the single source of validation. Anything read from disk
or crossing a package boundary is parsed, not cast.

### 2. `packages/room-ledger` (event-sourced, file-backed)

- **`LedgerStore` interface** — storage-agnostic:
  - `appendEvent(roomId, event): Promise<void>`
  - `readEvents(roomId): Promise<LedgerEvent[]>`
  - `listRooms(): Promise<string[]>`
- **`FileLedgerStore(rootDir)`** — events live at `<rootDir>/<roomId>/events.jsonl`,
  one JSON-encoded `LedgerEvent` per line, appended atomically. `readEvents` parses each
  line and validates it against the `LedgerEvent` schema (files are hand-editable — a
  trust boundary). `listRooms` lists subdirectories. Creates directories on demand.
- **`RoomLedger`** — wraps a `LedgerStore`:
  - pure **`applyEvent(state, event): RoomState`** reducer (the testable core) and an
    `applyEvents(events)` fold over an empty state.
  - `getState(roomId)` = `applyEvents(await store.readEvents(roomId))`.
  - Typed convenience methods that build → validate → append the right event and return
    updated state: `createRoom`, `addParticipant`, `createTask`, `assignTask`,
    `setTaskStatus`, `recordReview`, `recordValidation`, `recordEscalation`. Each takes
    an explicit `at` timestamp (caller-supplied) to keep the core pure and testable.

  *ponytail: state derived by folding the log on every read; add a snapshot cache only
  if replay is measurably slow.*

  **Allowed imports:** `@octowiz/schemas` and Node stdlib (`node:fs/promises`,
  `node:path`) only.

### 3. `packages/doctrine` (thin, pure, real)

Pure functions over `RoomState` + schema types (replaces the current
`DOCTRINE_BASED_ON_SCHEMAS` stub):

- **`canReview(state, taskId, reviewerId): boolean`** — true only if the reviewer is a
  participant, holds the `reviewer` role, and is **not** the task's `implementerId`
  (no self-review).
- **`isMergeReady(state, taskId): { ready: boolean, reasons: string[] }`** — `ready`
  requires: the latest `Validation` for the task is `passed`, **and** at least one
  `approved` `Review` exists from a reviewer who is not the implementer. `reasons` lists
  every failing condition (empty when ready).

  *ponytail: waiver rules deferred; add a `waivers` input to `isMergeReady` when a real
  waiver flow exists.*

  **Allowed imports:** `@octowiz/schemas` only.

### 4. Testing (Vitest, per package)

- **schemas** — a few parse round-trip + reject-invalid cases for the discriminated
  union and one representative entity.
- **room-ledger** — `applyEvent` reducer unit tests (each event kind folds correctly);
  one `FileLedgerStore` round-trip against a temp dir (`node:os` tmpdir); one
  reject-corrupt-line test.
- **doctrine** — `canReview` (self vs non-self, missing role) and `isMergeReady` (each
  failing reason + the happy path).
- **Tracer-bullet integration test** (in `room-ledger`): create room → add implementer
  + reviewer → create + assign task → record passing validation → record approving
  review → reload state from disk → assert `isMergeReady` is `true`; flip the review to
  `rejected` and assert it is `false` with the right reason.

## Definition of Done

1. `packages/schemas` exports the entities, `LedgerEvent` union, `RoomState`, and
   `SCHEMAS_VERSION` `0.1.0`; Zod added to the pnpm catalog.
2. `packages/room-ledger` exports `LedgerStore`, `FileLedgerStore`, `RoomLedger`, and
   the pure reducer; events persist to and reload from disk correctly.
3. `packages/doctrine` exports `canReview` and `isMergeReady` over real state.
4. The tracer-bullet integration test passes.
5. `pnpm lint` + `pnpm -r type-check` + `pnpm -r test` are green; import boundaries hold.
6. Independent code review before merge (no self-review, per doctrine).
