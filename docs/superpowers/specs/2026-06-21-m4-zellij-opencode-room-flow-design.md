# M4 — Zellij/OpenCode Room Flow (Design)

**Date:** 2026-06-21
**Milestone:** 4 (see `docs/mvp.md`)
**Builds on (merged M3):** `@octowiz/schemas`, `@octowiz/room-ledger`, `@octowiz/doctrine`

## Goal

Prove the room spine end-to-end: a human runs one command, gets a coding room recorded
in the ledger, a Zellij session, and OpenCode running inside it — with the start recorded
as ledger events. Plus a validation runtime that runs checks and writes a `Validation`
result to the ledger.

This is the MVP DoD steps 1–3 + 7 (create room, Zellij starts/attaches, OpenCode starts,
validation runs and writes to the ledger).

## Approach: thin end-to-end tracer

Build **one vertical flow** first, with each package built only as deep as the flow needs.
Do **not** build the adapters out to their full `docs/packages.md` responsibility lists
(pane management, shared-access API, all OpenCode commands) — those land when a consumer
needs them. Tracer-bullet over horizontal layers.

## Architecture & package map

```
packages/schemas        (extend)  + session.started event, + RoomState.sessions projection
packages/room-ledger    (extend)  + reducer case, + RoomLedger.recordSessionStart
packages/zellij-adapter (new)      build argv + shell out to `zellij` via injected exec
packages/opencode-adapter (new)    build argv only (startArgs) — no process spawning of its own
packages/validation     (new)      run named shell checks → ValidationCheck[] → Validation
scripts/octowiz.ts      (new)      CLI: create-room | start | validate | status | up
```

All new packages follow the M3 template: `@octowiz/<name>`, `private`, `type: module`,
`types`/`exports` point at `./src/index.ts` (no build step), `vitest` + `tsc --noEmit`,
deps via `workspace:*` / `catalog:`.

### The exec seam (applies to all shelling-out code)

Each adapter and the validation runtime is **pure logic** (build the right argv, map the
result) plus a single injected runner:

```ts
type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>
```

The default `Run` wraps `node:child_process` (`execFile`); tests inject a fake. This keeps
the real `zellij` / `opencode` binaries out of unit tests and CI, and makes every package a
deep module testable without spawning anything. Rejected: `vi.mock('node:child_process')` —
couples tests to node internals and the call shape.

## Schema extension

One new member on the `LedgerEvent` discriminated union in `@octowiz/schemas`:

```ts
{ type: 'session.started', at: string, roomId: string,
  tool: 'zellij' | 'opencode', sessionName: string }
```

- **No `SCHEMAS_VERSION` bump.** The change is additive — every existing event still
  validates against the wider union, and old ledgers read fine under new code. Bumping the
  `z.literal(SCHEMAS_VERSION)` envelope would instead *create* breakage (reject every
  `0.1.0` line and the M3 tests). `SCHEMAS_VERSION` stays `'0.1.0'`; update the existing
  `ponytail:` note at `index.ts:104` to say additive variants ride the current version, and
  the union widens to a migrated multi-version envelope only when a genuinely breaking
  change ships.
- **Session name is derived deterministically:** `octowiz-<roomId>`. Reproducible attach,
  nothing to store or look up.
- **`tool: 'opencode'` reuses the same `sessionName`** (the Zellij session OpenCode was
  launched into). OpenCode is a process in a pane, not its own session, so the event records
  *which room session it joined* — accepted explicitly; no distinguishing field added.

### Projection

Add a small array to `RoomState` so `status` can read sessions without re-scanning the log:

```ts
sessions: { tool: 'zellij' | 'opencode', sessionName: string, at: string }[]
```

Reducer appends on `session.started`. New facade method:

```ts
RoomLedger.recordSessionStart(roomId, tool, sessionName, at): Promise<RoomState>
```

## `packages/zellij-adapter`

Narrow surface — only what the tracer needs:

- `sessionName(roomId): string` → `octowiz-${roomId}`
- `ensureSession(roomId, run): Promise<void>` — `zellij list-sessions`; if the room's session
  is absent, create it detached; else no-op (attach-friendly). Idempotent.
- `runInSession(roomId, argv, run): Promise<void>` — launch a command in a pane of the
  session (`zellij --session <name> run -- <argv...>` or the verified equivalent).

Deferred: full pane-management and shared-access API from `docs/packages.md`.

## `packages/opencode-adapter`

**Builds argv only — does not spawn, and does not depend on `zellij-adapter`.**

- `startArgs(repoPath, taskContext): string[]` — pure builder. Passes repo path + task
  title/description to OpenCode (exact flag/env/prompt-file mechanism resolved against the
  real binary — see Open questions).

The **CLI** does the composition: `zellij.runInSession(roomId, opencode.startArgs(...), run)`.
This keeps the two adapters independent (no cross-adapter dependency) and puts orchestration
in one place. We do not reimplement any OpenCode feature — we only launch it with context.

## `packages/validation`

- `Check = { name: string, cmd: string, args: string[] }`
- `DEFAULT_CHECKS` = lint / type-check / test as the workspace commands
  (`pnpm lint`, `pnpm -r type-check`, `pnpm -r test`).
- `runValidation(taskId, checks, run, now): Promise<Validation>` — runs each check, maps
  exit code → `passed | failed`, captures output into `ValidationCheck`, overall `failed`
  if any check fails. Returns the existing `Validation` Zod shape; the caller passes it to
  `RoomLedger.recordValidation`.

Caller can override `checks`; defaults provided. Pure mapping over the injected `run`.

## CLI — `scripts/octowiz.ts`

Single entry, arg parsing via `node:util.parseArgs` (no `commander`/`yargs` dependency).
Run with `node` directly (node LTS strips TS types) or `tsx` if the pinned node needs it.

| Subcommand | Does |
|---|---|
| `create-room --name <n>` | `RoomLedger.createRoom` |
| `start --room <id> --repo <path>` | `ensureSession` + `recordSessionStart('zellij')`; then `runInSession(opencode.startArgs(...))` + `recordSessionStart('opencode')` |
| `validate --room <id> --task <id>` | `runValidation(DEFAULT_CHECKS)` + `recordValidation` |
| `status --room <id>` | print the `getState` projection (room, participants, tasks, sessions, validations) |
| `up --name <n> --repo <path>` | `create-room` → `start`, the whole tracer in one command |

Ledger root: a fixed local path (e.g. `.octowiz/ledger`) for the MVP; `FileLedgerStore`
writes `<root>/<roomId>/events.jsonl`.

## Implementation slices (TDD order)

Each slice: failing test → green → its own commit. Slices 2 & 3 additionally require the
command to be **verified against the real binary**, not just unit tests green.

1. **Schema + ledger:** `session.started` event + `RoomState.sessions` projection + reducer
   case + `recordSessionStart`. Unit tests on schema parse + reducer + facade.
2. **zellij-adapter** + `create-room`/`start` wiring `session.started('zellij')`.
   *Acceptance: argv builders unit-tested AND `ensureSession`/`runInSession` verified to
   create/launch against a real `zellij` install.*
3. **opencode-adapter** (`startArgs`) + CLI composition launching OpenCode into the pane +
   `session.started('opencode')`.
   *Acceptance: `startArgs` unit-tested AND OpenCode verified to actually start with repo/task
   context against the real `opencode` binary.*
4. **validation** runtime + `validate` subcommand writing a `Validation` to the ledger.
5. **`up`** glue + `status` readout. End-to-end smoke of the whole tracer.

## Testing

- Unit: pure argv/mapping logic with an injected fake `run` (no real binaries). Vitest.
- Binary verification (slices 2/3): manual/scripted run against installed `zellij`/`opencode`
  to confirm the actual invocations, recorded in the slice's acceptance notes.
- Gate (must stay green): `pnpm lint`, `pnpm -r type-check`, `pnpm -r test`.

## Out of scope / deferred (explicit)

- **Sandbox** — host-first, no abstraction this milestone. M5 owns `packages/sandbox-runtime`
  + the replaceable provider interface; it wraps the launch then. No `SandboxProvider` stub
  now (speculative interface-with-one-impl).
- **Doctrine issues #4/#5 (`isMergeReady`)** — fixed independently on their own branch (they
  don't depend on M4 status-transition wiring); not part of this tracer's scope.
- Full Zellij pane/shared-access API, multi-agent assignment, review flow, GitHub delivery,
  ÆLLI escalation, Nuxt UI — later milestones.

## Open questions (resolved during implementation, isolated to one place each)

- **OpenCode context-passing mechanism** — arg vs env vs prompt file. Isolated to
  `opencode-adapter.startArgs`; resolve against the real binary in slice 3.
- **Zellij detached-launch invocation** — exact `zellij … run`/`action` form to launch a
  command into a session with no client attached. Isolated to `zellij-adapter`; resolve in
  slice 2.
