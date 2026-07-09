# @octowiz/room-ledger

Event-sourced room state. Each room is an append-only event log; current
`RoomState` is a pure fold (`applyEvent`) over the log. Storage hides behind the
`LedgerStore` interface with two backends: `FileLedgerStore` (one `events.jsonl` per
room) and `SqliteLedgerStore` (`node:sqlite`, one db file, no dependency).
`RoomLedger` is the typed facade.

Callers supply event timestamps (`at`) so the reducer stays deterministic. Events are
validated at both boundaries: `RoomLedger` rejects invariant-violating events before
append, and both stores parse every line/row (schema + version) on read.

**Concurrent writers.** `RoomLedger` guards the read-validate-append window by passing
the log length it validated against to `appendEvent` (`expectedCount`).
`SqliteLedgerStore` commits only if the log is still that long, so a racing writer gets
a `ConcurrentWriteError` instead of corrupting the replay. `FileLedgerStore` ignores the
guard — it keeps the **single-writer-per-room precondition** (one orchestrator per
room); use `SqliteLedgerStore` whenever concurrent writers are possible.

Allowed imports: `@octowiz/schemas`, `node:` builtins, and other `packages/*` only.
