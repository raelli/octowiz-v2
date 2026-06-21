# Skill Composition Strategy

This document commits the MVP position on how skills are selected, combined, and
deconflicted. It defines the minimal contract `packages/skill-runtime` (#25) must
satisfy so the runtime can be built without further design work.

The approved skills are listed in `docs/skill-capability-audit.md`. That document
is the single source of truth for which skills exist; this one assumes the runtime
loads exactly that set.

## Selection

For a task, the runtime selects every approved skill whose trigger signals match.
The signals are those already named in `docs/packages.md`:

- task type
- repo stack
- role (implementer, reviewer, validator, advisor)
- workflow step
- file paths
- validation failures
- room policy

Selection is matching, not inference. A skill either matches the current signals
or it does not. There is no scoring, ranking, or learned selection in the MVP.

## Composition

Multiple matched skills apply to the same task at once. Composition for the MVP is
**concatenation**: the runtime exposes the instructions of all matched skills,
ordered by the precedence below, to OpenCode / the agent / ÆLLI. The native
doctrine skills (`role-separation`, `no-self-review`, `ledger-recording`,
`sandbox-policy`) are always in effect and are never dropped by composition.

## Conflict Resolution

When two applied skills give conflicting instructions, the runtime resolves by a
fixed precedence ordering (highest wins):

1. **Sandbox policy** — never overridden. A skill cannot instruct an action the
   sandbox boundary forbids.
2. **Octowiz doctrine (native skills)** — role separation, no-self-review,
   adversarial review, validation loop, escalation, ledger recording.
3. **Skill instructions (external patterns)** — applied only where they do not
   contradict the layers above.

Tie-break within the same layer: **native outranks external**, then registry
order. This is a precedence list, not a resolver engine — the runtime applies it
deterministically with no negotiation step.

## Minimal Runtime Contract

The M7b runtime must satisfy the following. Each maps to a file named in
`docs/packages.md`.

- `skill-registry.ts` — holds exactly the approved skills from the audit, each
  with `id`, `origin`, `workflowStage`, and trigger signals.
- `skill-loader.ts` — discovers and loads those skills; loads no skill absent from
  the registry.
- `skill-trigger-matcher.ts` — returns the matched skills for a set of signals by
  exact matching (no scoring).
- `skill-composer.ts` — concatenates matched-skill instructions in precedence
  order; never drops an always-in-effect native skill.
- `skill-conflict-resolver.ts` — applies the fixed precedence list above; no
  dynamic resolution.
- `skill-ledger-recorder.ts` — records active skills and skill decisions to the
  room ledger.

## Out of Scope for MVP

The MVP explicitly does **not** build, and the runtime slice is not required to
implement:

- A speculative composition engine that merges, rewrites, or synthesizes skill
  instructions. Composition is concatenation only.
- A trigger-matcher beyond exact signal matching — no scoring, ranking, ML, or
  inferred selection.
- A conflict-resolver beyond the fixed precedence list above — no negotiation,
  voting, or runtime policy learning.
- Dynamic registration or discovery of skills outside the approved list.

These are deferred until the MVP proves the minimal contract is sufficient.
