# Octowiz Engineering Doctrine

These rules are **enforced** (permission config + doctrine-guard plugin), not merely suggested.
This file is loaded automatically into every opencode session — doctrine persists across
sessions with zero code.

- **No self-review.** The agent that implements does not approve its own work. Review runs as
  the `reviewer` subagent, which **cannot edit** (enforced by per-agent permission).
- **Validation before commit.** No `git commit` until validation has passed
  (enforced by the doctrine-guard plugin via the `.octowiz/validation-passed` marker).
- **No direct push.** `git push` is denied; delivery goes through the reviewed PR flow
  (enforced by `permission` config).
- **TDD.** Write the failing test before the implementation.
