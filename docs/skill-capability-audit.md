# Skill Capability Audit

This document is the canonical list of skills the Octowiz MVP runtime
(`packages/skill-runtime`, see `docs/packages.md`) is allowed to load. It is the
single source of truth referenced by `docs/skill-composition-strategy.md`.

## Purpose

The MVP proves a doctrine-driven workflow: implement, review, validate, escalate,
deliver (see `docs/mvp.md` and `docs/architecture.md`). Skills encode that
doctrine and the proven engineering disciplines the workflow depends on. They are
the instructions the runtime exposes to OpenCode, agents, and ÆLLI escalation.

## Inclusion Criterion

A skill is approved for the MVP only if it serves a stage of the MVP workflow:

1. plan / decompose
2. implement
3. review (adversarial, no self-approval)
4. validate
5. escalate to ÆLLI
6. deliver to GitHub

Anything that does not serve one of these stages is deferred. We do not import an
ecosystem of skills "in case they are useful" — that is out of MVP scope.

## Origin

Each approved skill is one of two origins:

- **native** — Octowiz operational doctrine, expressed as a skill. These are
  non-negotiable process rules drawn from `docs/architecture.md`.
- **external** — an imported, proven engineering discipline pattern.

## Approved MVP Skills

| Skill                  | Origin   | Workflow stage   | When it applies                                              | Why in scope |
| ---------------------- | -------- | ---------------- | ------------------------------------------------------------ | ------------ |
| `role-separation`      | native   | review           | Any task touching implement + review + validate.             | Doctrine: roles must be separated. |
| `no-self-review`       | native   | review           | Whenever a review or approval is requested.                  | Doctrine: no agent or human approves their own work. |
| `adversarial-review`   | native   | review           | When a change is up for review.                              | Doctrine: review must actively try to reject. |
| `validation-loop`      | native   | validate         | After an implementation, before merge readiness.             | Doctrine: validation gates delivery; failures feed back. |
| `aelli-escalation`     | native   | escalate         | When a task is ambiguous, risky, or blocked.                 | Doctrine: escalate to a stronger model with room context. |
| `ledger-recording`     | native   | all              | On every task, review, validation, and skill decision.       | Doctrine: room state and decisions are recorded. |
| `sandbox-policy`       | native   | all              | Any action that runs commands or touches the filesystem.     | Doctrine: each room runs inside a sandbox boundary. |
| `task-planning`        | external | plan             | A multi-step task before code is written.                    | Decomposition raises quality independent of model power. |
| `brainstorming`        | external | plan             | A task with unclear intent or design space.                  | Surfaces requirements before implementation. |
| `test-driven-development` | external | implement     | Implementing a feature or fixing a bug.                      | Test-first discipline; pairs with `validation-loop`. |
| `systematic-debugging` | external | implement        | On a bug, test failure, or unexpected behavior.              | Reproduce-before-fix discipline. |
| `code-review`          | external | review           | When reviewing a diff.                                       | Structured review checklist; pairs with `adversarial-review`. |
| `github-delivery`      | external | deliver          | Producing a branch and PR summary.                           | Branch + PR-body discipline for merge readiness. |

## Native vs External Summary

- **Native (doctrine):** `role-separation`, `no-self-review`,
  `adversarial-review`, `validation-loop`, `aelli-escalation`,
  `ledger-recording`, `sandbox-policy`.
- **External (imported patterns):** `task-planning`, `brainstorming`,
  `test-driven-development`, `systematic-debugging`, `code-review`,
  `github-delivery`.

## Registry Shape (descriptive only)

The M7b runtime (#25) will add `skills/registry.json`. This document does not
create it. Its intended shape, per skill: `id`, `origin` (`native` | `external`),
`workflowStage`, and the trigger signals from `docs/packages.md` (task type, repo
stack, role, workflow step, file paths, validation failures, room policy). The
registry must contain exactly the skills approved above and no others.

## Out of Scope

- Any skill not mapped to an MVP workflow stage above.
- General-purpose or domain-specific skills (framework helpers, docs writers, UI
  reviewers) that do not gate the implement → deliver path.
- Creating the registry file or any runtime code — that is M7b (#25).
