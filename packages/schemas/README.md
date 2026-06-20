# @octowiz/schemas

Shared, versioned Zod schemas and inferred types for the octowiz domain: rooms,
participants, tasks, reviews, validations, escalations, the `LedgerEvent` union, and
the `RoomState` projection. `SCHEMAS_VERSION` is stamped into persisted data.

Each entity is exported twice: a `…Schema` value (the Zod schema, e.g. `RoomSchema`)
and a clean inferred type (e.g. `Room`). Parse, don't cast, at every trust boundary.

Allowed imports: `zod` and other `packages/*` only.
