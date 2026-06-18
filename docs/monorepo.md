# Monorepo Architecture

## Decision

Octowiz-v2 must be a **pnpm workspace monorepo**.

The repository structure is based on three primary workspace zones:

```text
apps/     = concrete runnable entrypoints
layers/   = Nuxt layers for cascading UI, shell, config, and product surfaces
packages/ = pure domain logic, adapters, schemas, runtimes, and guardrails
```

This is not just a folder convention. It is an architecture rule.

The goal is to prevent random cross-imports, keep domains small, make the system easier for humans and agents to navigate, and allow the product to scale without turning into a TypeScript swamp with decorative folders.

## Proposed Structure

```text
octowiz-v2/
├── README.md
├── PROJECT_PLAN.md
├── CONCEPT.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .npmrc
├── .nuxtrc
├── .editorconfig
├── mise.toml
├── tsconfig.base.json
│
├── docs/
│   ├── architecture.md
│   ├── monorepo.md
│   ├── tooling.md
│   ├── apps-and-layers.md
│   ├── packages.md
│   ├── doctrine.md
│   ├── room-ledger.md
│   ├── sandbox.md
│   ├── skills.md
│   ├── skill-sources.md
│   ├── mvp.md
│   └── workflows.md
│
├── apps/
│   ├── octowiz-web/
│   ├── octowiz-api/
│   ├── octowiz-worker/
│   └── aelli-control-plane/
│
├── layers/
│   ├── base/
│   ├── ui/
│   ├── octowiz-shell/
│   ├── room-dashboard/
│   ├── aelli-console/
│   └── docs/
│
├── packages/
│   ├── config-eslint/
│   ├── config-typescript/
│   ├── design-tokens/
│   ├── schemas/
│   ├── a2a-gateway/
│   ├── memory/
│   ├── model-router/
│   ├── engineering-knowledge/
│   ├── doctrine/
│   ├── room-ledger/
│   ├── zellij-adapter/
│   ├── opencode-adapter/
│   ├── github-adapter/
│   ├── aelli-adapter/
│   ├── agent-runtime/
│   ├── skill-runtime/
│   ├── sandbox-runtime/
│   ├── validation/
│   └── arena-runtime/
│
├── skills/
│   ├── upstream/
│   ├── octowiz/
│   └── registry.json
│
├── examples/
│   ├── room-ledger.example.json
│   ├── arena-task.example.json
│   └── task.example.md
│
└── scripts/
    ├── create-room.sh
    ├── start-opencode.sh
    ├── run-validation.sh
    └── dev-room.sh
```

## pnpm Workspace Configuration

`pnpm-workspace.yaml` should include:

```yaml
packages:
  - "apps/*"
  - "layers/*"
  - "packages/*"
  - "skills/*"
```

## Import and Boundary Rules

The monorepo must enforce dependency direction.

```text
apps/* may import from layers/* and packages/*
layers/* may import from packages/*
packages/* may not import from apps/*
packages/* may not import from layers/*
packages/* should expose only explicit public entrypoints
```

Nuxt layers should avoid importing from sibling layers unless that relationship is deliberate and documented.

Every package and layer should have a small README that explains:

- purpose
- allowed imports
- exported entrypoints
- ownership/domain boundaries
- examples

Boundary violations should be caught by linting, not by someone noticing three weeks later during a heroic archaeology expedition.
