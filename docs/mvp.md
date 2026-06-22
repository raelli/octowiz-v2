# MVP Plan

## MVP Scope

The first MVP should prove:

> A human can create a coding room, run OpenCode inside a shared Zellij session, assign a task to an agent, run validation, produce a review, and create a GitHub-ready change.

## MVP Features

1. Create a coding room.
2. Spawn or attach to a Zellij session.
3. Start OpenCode inside the session.
4. Assign a task to one agent.
5. Record task state in the room ledger.
6. Run validation.
7. Require a separate reviewer.
8. Escalate to ÆLLI when the task is ambiguous, risky, or blocked.
9. Generate a GitHub-ready branch/PR summary.
10. Expose basic room status through CLI first and Nuxt web second.

## MVP Non-Goals

The MVP should not initially require:

- full cloud deployment
- full MicroVM implementation
- full visual IDE replacement
- replacing OpenCode functionality
- Claude Code compatibility
- complex multi-tenant SaaS behavior
- a large frontend before the room runtime works
- React

## Milestones

### Milestone 1: Repo Foundation

- Add pnpm workspace setup.
- Add `apps/`, `layers/`, `packages/`, `docs/`, `skills/`, `examples/`, and `scripts/` directories.
- Add `mise.toml`.
- Add `.editorconfig` and `.npmrc`.
- Add `tsconfig.base.json`.
- Add shared ESLint and TypeScript config packages.
- Document OpenCode-first and no React direction.
- Document human collaboration roles for Janis, Bo, and Dennis.

### Milestone 2: Monorepo Guardrails

- Add import-boundary lint rules.
- Add shared package export conventions.
- Add package/layer README templates.
- Add SecretLint or equivalent.
- Add commit-message quality gate.
- Add workspace-wide `lint`, `type-check`, `test`, and `dev:prepare` scripts.

### Milestone 3: Core Domain Packages

- Add `packages/schemas`.
- Add `packages/doctrine`.
- Add `packages/room-ledger`.
- Add `packages/validation`.
- Add initial file-based or SQLite room ledger storage.

### Milestone 4: Zellij/OpenCode Room Flow

- Add `packages/zellij-adapter`.
- Add `packages/opencode-adapter`.
- Add script to create a room.
- Add script to start Zellij session.
- Add script to start OpenCode in session.
- Record room start events in the ledger.

### Milestone 5: Sandbox Runtime Foundation

- Add `packages/sandbox-runtime`.
- Add rootless Docker/Podman provider for MVP.
- Define provider interface for future Kata/Firecracker support.
- Ensure room lifecycle does not depend on one sandbox provider.

### Milestone 6: Agent Role Prototype

- Add `packages/agent-runtime`.
- Define implementer, reviewer, validator, and advisor roles.
- Enforce no self-review.
- Connect local model worker path.
- Add ÆLLI escalation handoff path.

### Milestone 7: Skill Capability Audit and Runtime

- Create `docs/skill-capability-audit.md`.
- Create `docs/skill-composition-strategy.md`.
- Add `packages/skill-runtime`.
- Add initial `skills/registry.json`.
- Define approved MVP skills.

### Milestone 8: GitHub Delivery

- Add `packages/github-adapter`.
- Create branch workflow.
- Generate PR body.
- Attach validation and review summary.
- Make merge-readiness explicit.

### Milestone 9: ÆLLI Escalation

- Add `packages/aelli-adapter`.
- Pass room context, task state, review state, and validation state to ÆLLI.
- Store ÆLLI recommendations in the room ledger.
- Define escalation triggers.

### Milestone 10: Nuxt Web Entry

- Add `apps/octowiz-web`.
- Add `layers/base`.
- Add `layers/ui`.
- Add `layers/octowiz-shell`.
- Add `layers/room-dashboard`.
- Display room status, participants, task state, validation state, review state, and escalation state.

## Definition of Done for MVP

The MVP is successful when:

1. A room can be created from the CLI.
2. Zellij starts or attaches to that room.
3. OpenCode starts inside the room.
4. A task is assigned to an implementation agent.
5. The implementation is recorded in the room ledger.
6. A different reviewer validates or rejects the change.
7. Validation runs and writes results to the ledger.
8. ÆLLI can be called for escalation with useful context.
9. A GitHub-ready branch and PR summary can be produced.
10. A basic Nuxt dashboard can display the room state.
