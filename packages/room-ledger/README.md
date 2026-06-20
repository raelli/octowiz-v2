# @octowiz/room-ledger

Event-sourced room state. Each room is an append-only `events.jsonl` log; current
`RoomState` is a pure fold (`applyEvent`) over the log. Storage hides behind the
`LedgerStore` interface — `FileLedgerStore` is the MVP backend; SQLite can replace it
without touching callers. `RoomLedger` is the typed facade.

Callers supply event timestamps (`at`) so the reducer stays deterministic. Events are
validated at both boundaries: `RoomLedger` rejects invariant-violating events before
append, and `FileLedgerStore` parses every line (schema + version) on read.

**Precondition — single writer per room.** The read-validate-append cycle is not atomic
across concurrent `RoomLedger` instances or processes, so each room's log must have one
writer at a time (one orchestrator). Concurrent writers can append conflicting events and
corrupt the replay. When concurrent writes are required, swap `FileLedgerStore` for a
transactional backend (the planned SQLite `LedgerStore`) rather than adding file locks.

Allowed imports: `@octowiz/schemas`, `node:` builtins, and other `packages/*` only.
