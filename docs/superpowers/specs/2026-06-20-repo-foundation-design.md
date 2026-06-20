# Repo Foundation — Design Spec

- **Date:** 2026-06-20
- **Status:** Approved (brainstorming) — ready for implementation plan
- **Slice:** First buildable slice of octowiz-v2. Covers MVP Milestone 1 plus the two high-leverage Milestone 2 guardrails (import boundaries, workspace scripts).

## Goal

Stand up the pnpm workspace foundation for octowiz-v2: shared TypeScript and ESLint
config packages, the directory skeleton, root tooling, enforced import boundaries, and
workspace-wide scripts — proven end-to-end by a minimal package-to-package import.

This is a horizontal foundation slice by deliberate choice (the user picked "repo
foundation first"). It is kept thin: only enough is scaffolded to *verify* the
foundation works. Vertical room logic comes in later slices, each with its own
spec → plan → build cycle.

## Non-Goals

Explicitly deferred to later slices:

- `.nuxtrc` — no Nuxt layer exists yet; it lands with `layers/base`.
- SecretLint and the commit-message quality gate (rest of Milestone 2).
- Turborepo or any task runner — plain `pnpm -r` is sufficient at this size.
- `packages/design-tokens`, Nuxt layers, apps with real behavior, CI pipeline.
- Any room/ledger/agent/validation domain logic.
- Stubbing all ~19 packages / 4 apps / 6 layers — only two real packages are created.

## Approach

**Antfu-idiomatic, lean, two-layer boundaries.** `@antfu/eslint-config` is the ESLint
base (house style — antfu-skills is installed; stack is Nuxt/Vue/UnoCSS/Vite/pnpm),
wrapped by `packages/config-eslint`. Import boundaries are enforced at two layers:
structurally via pnpm (a package cannot import what it has not declared in
`package.json`) and via lint (catch cross-root relative-path escapes). Workspace tasks
run through plain `pnpm -r` with no task runner.

Alternatives considered and rejected for this slice:

- **Boundaries via `no-restricted-imports` only** — fewer deps, less precise. The lint
  mechanism is not load-bearing; either is acceptable, decided at implementation.
- **Turborepo from day one** — premature complexity for ~2 real packages. Deferred.

## Design

### 1. Workspace topology & root tooling

- `pnpm-workspace.yaml` globs: `apps/*`, `layers/*`, `packages/*`, `skills/*`.
  Includes a **pnpm catalog** for shared dependency versions.
- Root `package.json`: `private: true`, `packageManager` pin, workspace scripts (§4).
- `mise.toml` pins the Node (and pnpm) toolchain.
- `.editorconfig`, `.npmrc`, `tsconfig.base.json` at the repo root.
- `.npmrc` supply-chain guardrails: `minimumReleaseAge` where practical, restricted
  build scripts by default, committed lockfile, no implicit package-manager switching.
- Directory skeleton created with `.gitkeep` where otherwise empty:
  `apps/ layers/ packages/ skills/ examples/ scripts/`.

### 2. Shared config packages

Internal npm scope: `@octowiz/*`.

- **`packages/config-typescript`** — exposes tsconfig presets that extend the root
  `tsconfig.base.json`:
  - `base` — strict shared compiler options for any TS package.
  - `node` — Node/library package preset.
  - `vue-nuxt` — stubbed preset for later Nuxt/Vue layers (not consumed yet).

  Other workspace packages set `extends` to the relevant preset. `tsconfig.base.json`
  holds the strictness shared by all (`strict: true`, etc.).

- **`packages/config-eslint`** — exports a flat-config factory wrapping
  `@antfu/eslint-config` and layering in the import-boundary rules (§3). A single root
  `eslint.config` applies it across the whole workspace.

### 3. Import-boundary enforcement (two layers)

Allowed dependency direction:

```
apps/*   -> layers/* , packages/*
layers/* -> packages/*
packages/* -> packages/*        (never apps/* or layers/*)
```

- **Layer 1 — structural (free):** each `package.json` declares only the workspace deps
  it is permitted to use. pnpm refuses to resolve an undeclared import. Reviewed at the
  `package.json` level.
- **Layer 2 — lint:** a rule in `config-eslint` bans cross-root relative-path escapes
  (e.g. `../../apps/...`) and reinforces the direction above. Concrete mechanism
  (`eslint-plugin-boundaries` vs `no-restricted-imports`) is chosen at implementation;
  it is not load-bearing because both run inside the same `pnpm lint`.

### 4. Workspace scripts

Root scripts fan out via `pnpm -r --parallel`:

- `lint`, `lint:fix`
- `type-check`
- `test`

Each package carries its own matching scripts so the root can delegate. `test` is wired
to Vitest, with a trivial test in the proof package so the wiring is exercised.

### 5. Proof slice (tracer for the foundation itself)

- **`packages/schemas`** — near-empty package exporting one trivial type/const, with a
  `package.json` and a tsconfig extending the `base` preset.
- **`packages/doctrine`** (stub) — imports `packages/schemas`. Exercises one **allowed**
  package→package import, resolving through the shared configs, without naming a
  CLI/Nuxt app (kept non-speculative).

The proof intentionally avoids creating an app: the MVP is CLI-first but `apps/` defines
no CLI yet, and a real Nuxt/Nitro app would drag in surface this slice does not need.

### 6. Error handling & failure modes

- A boundary violation fails `pnpm lint` (and therefore any future CI gate) rather than
  being discovered later by archaeology.
- Version drift across packages is contained by the pnpm catalog.
- Untrusted install-time build scripts are restricted by default via `.npmrc`.

## Definition of Done

1. `pnpm install` completes cleanly with a committed lockfile.
2. `pnpm -r type-check`, `pnpm -r lint`, and `pnpm -r test` all pass across the config
   packages and the two proof packages.
3. **Positive boundary check:** `packages/doctrine` imports `packages/schemas`, and it
   resolves and type-checks.
4. **Negative boundary check (the important one):** an intentional forbidden import —
   `packages/schemas` importing from `apps/*`, or a `../../apps` relative escape — is
   *demonstrably rejected* by `pnpm lint`. The violation is then removed, or kept as a
   documented fixture/test. This proves the rule actually fires; a green lint with no
   violating code proves nothing.

These two checks exercise the boundary machinery without needing the full direction
matrix.

## Notes on existing docs

The Milestone 1 documentation items (OpenCode-first, no-React direction, human
collaboration roles for Janis/Bo/Dennis) already exist under `docs/`
(`product-direction.md`, `tooling.md`, `human-collaboration.md`). This slice references
them rather than duplicating.

## Open implementation-time decisions (non-blocking)

- Exact tool versions — pinned at implementation against the live registry, not from
  memory.
- Lint boundary mechanism — `eslint-plugin-boundaries` vs `no-restricted-imports`.
- Whether the negative-boundary check is removed after verification or retained as a
  permanent fixture/test.
