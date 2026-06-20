# @octowiz/doctrine

Pure process rules over `RoomState`:

- `canReview(state, taskId, reviewerId)` — enforces no self-review (reviewer must be a
  participant with the reviewer role and not the task's implementer).
- `isMergeReady(state, taskId)` — `{ ready, reasons }`; requires a passing validation
  and an approving review from a non-implementer.

Allowed imports: `@octowiz/schemas` and other `packages/*` only.
