# Skill Composition Strategy

This document commits the MVP position on how skills are selected, combined, and
deconflicted. It defines the minimal contract the first runtime slice (#25) must
satisfy — **load + validate + expose** the approved skills — and records the
forward design for the later composition slice (matching, composition, conflict
resolution, ledger recording) so that slice can be built without further design
work. The composition rules below are that forward design; #25 itself does not
implement them.

The approved skills are listed in `docs/skill-capability-audit.md`. That document
is the single source of truth for which skills exist; this one assumes the runtime
loads exactly that set.

## Selection (later slice — not in #25)

Selection is the job of the trigger-matcher, which belongs to the later
composition slice, **not** to #25. #25 only loads, validates, and exposes the
approved skills; it does not match them to a task.

When the matcher slice is built, selection works like this: for a task, the
runtime selects every approved skill whose trigger signals match. The signal
*categories* are those named in `docs/packages.md`:

- task type
- repo stack
- role (implementer, reviewer, validator, advisor)
- workflow step
- file paths
- validation failures
- room policy

The concrete trigger-signal *vocabulary* and the per-skill mapping (which signal
values select which skill) are defined when the matcher slice is built and live
as data in the registry (`skills/registry.json`). This document does not enumerate
that vocabulary, and #25 does not consume it — #25 only validates that each loaded
skill carries its trigger-signal fields, without matching on them.

Selection is matching, not inference: once the vocabulary exists, a skill either
matches the current signals or it does not. There is no scoring, ranking, or
learned selection in the MVP.

## Composition (later slice — not in #25)

Composition is also part of the later slice, not #25. When built, multiple matched
skills apply to the same task at once. Composition for the MVP is
**concatenation**: the runtime exposes the instructions of all matched skills,
ordered by the precedence below, to OpenCode / the agent / ÆLLI.

### Always-active vs matched

Not every approved skill is gated by the (future) trigger matcher. Two classes
exist:

- **Always-active (cross-cutting):** `role-separation`, `no-self-review`,
  `ledger-recording`, and `sandbox-policy` apply at every stage regardless of
  trigger signals. They bypass the matcher gate and are never dropped by
  composition.
- **Matched (selected):** every other skill — the external/workflow patterns
  (`task-planning`, `code-review`, …) **and** the stage-specific native skills
  (`adversarial-review`, `validation-loop`, `aelli-escalation`) — is selected by
  the matcher for the stages it applies to.

So "always-active" is a deliberate cross-cutting subset, not "all native skills":
three native doctrine skills are stage-gated and matched like external skills.

## Conflict Resolution (later slice — not in #25)

Conflict resolution belongs to the later slice as well. When two applied skills
give conflicting instructions, the runtime resolves by a fixed precedence ordering
(highest wins):

1. **Sandbox policy** — never overridden. A skill cannot instruct an action the
   sandbox boundary forbids.
2. **Octowiz doctrine (native skills)** — role separation, no-self-review,
   adversarial review, validation loop, escalation, ledger recording.
3. **Skill instructions (external patterns)** — applied only where they do not
   contradict the layers above.

Tie-break within the same layer: **native outranks external**, then registry
order. This is a precedence list, not a resolver engine — the runtime applies it
deterministically with no negotiation step.

## Minimal Runtime Contract (#25)

#25 is **strictly load + validate + expose** the approved skills. Its minimal
contract is exactly two files from `docs/packages.md`:

- `skill-registry.ts` — the typed loader/accessor over the registry data
  (`skills/registry.json`). It reads the registry, validates that every entry is
  an approved skill carrying its required fields (`id`, `origin`, `workflowStage`,
  and the trigger-signal fields), and exposes that set. It does not match on the
  trigger signals; it only validates their presence.
- `skill-loader.ts` — discovers and loads those skills; loads no skill absent from
  the registry. A malformed or unapproved registry is rejected with a clear error
  rather than partially loading.

Nothing else is required of #25. In particular #25 does **not** match, compose,
resolve conflicts, or record to the ledger.

## Forward Design — Later Composition Slice (not in #25)

The remaining files named in `docs/packages.md` belong to a later composition
slice, built only after #25 proves the registry + loader is sufficient. They
realize the Selection / Composition / Conflict-Resolution rules above:

- `skill-trigger-matcher.ts` — returns the matched skills for a set of signals by
  exact matching (no scoring), using the trigger vocabulary defined when this
  slice is built.
- `skill-composer.ts` — concatenates matched-skill instructions in precedence
  order; never drops an always-active cross-cutting skill.
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
