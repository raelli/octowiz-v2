# @octowiz/doctrine

Pure process rules over `RoomState`:

- `canReview(state, taskId, reviewerId)` — enforces no self-review (reviewer must be a
  participant with the reviewer role and not the task's implementer).
- `isMergeReady(state, taskId)` — `{ ready, reasons }`; fails closed on lifecycle status
  (only `in_review`/`validated` tasks are merge candidates) and requires an assigned
  implementer, a passing validation, and a current approving review from a non-implementer.

Allowed imports: `@octowiz/schemas` and other `packages/*` only.
