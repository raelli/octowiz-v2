# Octowiz-v2 Project Plan

Octowiz-v2 is the new monorepo for the multiplayer AI engineering system.

> **Octowiz — the coding tentacle of ÆLLI.**

This file is intentionally only an index and roadmap. Detailed project information lives in focused documentation files under `docs/` so humans and agents can read the exact context they need without loading one giant document.

## Canonical Docs

- [`docs/product-direction.md`](docs/product-direction.md) — product positioning, boundaries, and operating model
- [`docs/architecture.md`](docs/architecture.md) — system architecture and responsibility split between ÆLLI and Octowiz
- [`docs/monorepo.md`](docs/monorepo.md) — pnpm workspace, Nuxt layers, package boundaries, and repo structure
- [`docs/tooling.md`](docs/tooling.md) — baseline stack, package manager, TypeScript, linting, and supply-chain guardrails
- [`docs/apps-and-layers.md`](docs/apps-and-layers.md) — app entrypoints and Nuxt layer responsibilities
- [`docs/packages.md`](docs/packages.md) — package responsibilities and domain boundaries
- [`docs/mvp.md`](docs/mvp.md) — MVP scope, non-goals, milestones, and definition of done
- [`docs/human-collaboration.md`](docs/human-collaboration.md) — collaboration model for humans and agents

## Core Direction

Octowiz-v2 is:

- OpenCode-first
- Zellij-powered
- pnpm workspace based
- Nuxt/Vue/Nitro oriented
- no React unless explicitly approved later
- local-first for the MVP
- designed for agent implementation, adversarial review, validation loops, and GitHub delivery

## Workspace Shape

```text
apps/     = concrete runnable entrypoints
layers/   = Nuxt layers for UI, shell, dashboards, docs, and product surfaces
packages/ = pure domain logic, adapters, schemas, runtimes, and guardrails
```

## MVP Goal

The MVP is successful when a human can create a shared coding room, run OpenCode inside a Zellij session, assign a task to an agent, record state in the room ledger, run validation, require separate review, escalate to ÆLLI when needed, and produce a GitHub-ready change.

For details, see [`docs/mvp.md`](docs/mvp.md).
