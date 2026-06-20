# @octowiz/room-ledger

Event-sourced room state. Each room is an append-only `events.jsonl` log; current
`RoomState` is a pure fold (`applyEvent`) over the log. Storage hides behind the
`LedgerStore` interface — `FileLedgerStore` is the MVP backend; SQLite can replace it
without touching callers. `RoomLedger` is the typed facade.

Callers supply event timestamps (`at`) so the reducer stays deterministic.

Allowed imports: `@octowiz/schemas`, `node:` builtins, and other `packages/*` only.
