# @octowiz/aelli-adapter

The escalation decision layer for ÆLLI. Pure functions over `RoomState` — no I/O.

- `shouldEscalate(state, taskId)` — `{ escalate, reason? }`. A small, explicit rule set
  (first match wins): latest validation failed, a reviewer's latest verdict is a rejection,
  or the task is blocked. "Latest" follows ledger append order (matching `@octowiz/doctrine`),
  not `createdAt`. `changes_requested` is the normal review loop and does NOT trigger.
- `buildEscalationRequest(state, taskId)` — shapes room / task / review / validation context
  (filtered to the task) into a self-contained `AelliEscalationRequest` payload for ÆLLI,
  carrying the escalation reason. Throws on an unknown task.

This slice answers "should we escalate, why, and with what context?". Actually sending the
request and recording the recommendation in the ledger is a separate slice (#33).

Allowed imports: `@octowiz/schemas` and other `packages/*` only.
