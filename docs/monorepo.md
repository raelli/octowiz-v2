# Monorepo Architecture
## Decision
Octowiz-v2 is a **pnpm workspace monorepo**.
The repository structure is based on three primary workspace zones:
```text
apps/     = concrete runnable entrypoints
layers/   = Nuxt layers for UI/shell composition
packages/ = pure domain logic, adapters, schemas, runtimes, and guardrails
```
This is not just a folder convention. It is an architecture rule.
The goal is to prevent random cross-imports, keep domains small, and make the system easier for humans and agents to navigate.
## Current Structure
```text
octowiz-v2/
├── README.md
├── PROJECT_PLAN.md
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .npmrc
├── .editorconfig
├── .secretlintrc.json
├── mise.toml
├── tsconfig.base.json
├── eslint.config.mjs
├── commitlint.config.mjs
│
├── docs/
│   ├── architecture.md
│   ├── apps-and-layers.md
│   ├── monorepo.md
│   ├── packages.md
│   ├── tooling.md
│   └── ...
│
├── apps/
│   └── octowiz-web/
│
├── layers/
│   ├── base/
│   ├── octowiz-shell/
│   ├── room-dashboard/
│   └── ui/
│
├── packages/
│   ├── aelli-adapter/
│   ├── agent-runtime/
│   ├── config-eslint/
│   ├── config-typescript/
│   ├── doctrine/
│   ├── github-adapter/
│   ├── opencode-adapter/
│   ├── room-ledger/
│   ├── sandbox-runtime/
│   ├── schemas/
│   ├── skill-runtime/
│   ├── validation/
│   └── zellij-adapter/
│
├── scripts/
│   ├── octowiz.ts
│   ├── orchestrate.ts
│   ├── git-diff.ts
│   └── *.test.ts
│
├── skills/
│   └── registry.json
│
└── examples/
```
## pnpm Workspace Configuration
`pnpm-workspace.yaml` currently includes:
```yaml
packages:
  - "apps/*"
  - "layers/*"
  - "packages/*"
  - "scripts"
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
scripts/* should consume package entrypoints instead of internal module paths
```
Nuxt layers should avoid importing from sibling layers unless that relationship is deliberate and documented.
