# Repo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the octowiz-v2 pnpm workspace foundation — shared TS/ESLint config packages, directory skeleton, root tooling, two-layer import boundaries, and workspace scripts — proven by a minimal package-to-package import and an automated boundary regression test.

**Architecture:** pnpm workspace with three zones (`apps/`, `layers/`, `packages/`). Shared config lives in `@octowiz/config-typescript` (tsconfig presets) and `@octowiz/config-eslint` (a factory wrapping `@antfu/eslint-config` plus import-boundary rules). Boundaries are enforced structurally (pnpm won't resolve undeclared deps) and by lint (`no-restricted-imports` blocks `packages/* → apps|layers`). Two tiny packages (`@octowiz/schemas`, `@octowiz/doctrine`) act as the tracer that proves the wiring.

**Tech Stack:** pnpm workspaces, Node (via mise), TypeScript (strict), `@antfu/eslint-config` (flat config), Vitest. Exact versions are resolved live by `pnpm add` during implementation — never hand-pinned.

---

## File Structure

Created in this slice:

```
octowiz-v2/
├── package.json                      # root: private, scripts, dev tooling, pnpm settings
├── pnpm-workspace.yaml               # workspace globs
├── tsconfig.base.json                # shared strictness, extended by config-typescript
├── eslint.config.mjs                 # root flat config, consumes @octowiz/config-eslint
├── mise.toml                         # Node toolchain pin
├── .editorconfig
├── .npmrc
├── apps/.gitkeep                     # empty zones kept in git
├── layers/.gitkeep
├── skills/.gitkeep
├── examples/.gitkeep
├── scripts/.gitkeep
└── packages/
    ├── config-typescript/
    │   ├── package.json
    │   ├── base.json
    │   ├── node.json
    │   ├── vue-nuxt.json             # stub preset for later Nuxt layers
    │   └── README.md
    ├── config-eslint/
    │   ├── package.json
    │   ├── index.js                  # octowiz() flat-config factory
    │   ├── boundary.test.ts          # permanent boundary regression test
    │   └── README.md
    ├── schemas/
    │   ├── package.json
    │   ├── src/index.ts
    │   ├── src/index.test.ts
    │   ├── tsconfig.json
    │   └── README.md
    └── doctrine/
        ├── package.json
        ├── src/index.ts              # imports @octowiz/schemas (positive boundary proof)
        ├── tsconfig.json
        └── README.md
```

**Deviations from the spec (deliberate, non-blocking):**

- **pnpm catalog** is split into an optional final task (Task 7). The core slice declares
  versions directly so the green Definition of Done never hinges on hand-managed catalog
  entries.
- **`jsonc`/`yaml`/`markdown` linting is disabled in v1** of the eslint config so
  `pnpm lint` is deterministic on hand-written JSON/Markdown. Boundary rules target code
  (`.ts/.js/.vue`) anyway. Can be enabled in a later slice.
- **Negative boundary check** is a permanent Vitest+ESLint regression test, not a
  manual add-then-remove (spec allowed either; this is the rigorous option).
- **Shared dev tooling** (`typescript`, `eslint`, `vitest`) is declared where it is
  imported/used rather than globally hoisted-by-accident, to keep dependency hygiene
  honest in a slice that is *about* boundaries.

---

## Task 1: Workspace skeleton & root tooling

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `mise.toml`, `.editorconfig`, `.npmrc`
- Create: `apps/.gitkeep`, `layers/.gitkeep`, `skills/.gitkeep`, `examples/.gitkeep`, `scripts/.gitkeep`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "layers/*"
  - "packages/*"
  - "skills/*"

# Supply-chain guardrail: block all dependency install-time build scripts by default.
# (pnpm 11 reads settings from here, not the package.json "pnpm" field.)
onlyBuiltDependencies: []
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "octowiz-v2",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "type-check": "pnpm -r --parallel type-check",
    "test": "pnpm -r --parallel test"
  }
}
```

The supply-chain guardrail (`onlyBuiltDependencies: []`) lives in `pnpm-workspace.yaml`
(Step 1), **not** here. pnpm 11 no longer reads a `pnpm` field from `package.json` and
warns if one is present. `devDependencies` are added by later tasks via `pnpm add`.
The `packageManager` field is written automatically by `corepack use` in Step 8.

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleDetection": "force",
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 4: Create `mise.toml`**

```toml
[tools]
node = "lts"
```

(`"lts"` resolves to the current LTS at install time. Pin to an exact version like
`"22.20.0"` later if reproducibility across machines becomes important.)

- [ ] **Step 5: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 6: Create `.npmrc`**

```ini
# Auto-install peer dependencies (antfu/eslint pull peers).
auto-install-peers=true
```

- [ ] **Step 7: Create the empty zone placeholders**

Run:
```bash
mkdir -p apps layers skills examples scripts packages
touch apps/.gitkeep layers/.gitkeep skills/.gitkeep examples/.gitkeep scripts/.gitkeep
```

- [ ] **Step 8: Pin pnpm and install**

Run:
```bash
corepack enable
corepack use pnpm@latest   # writes "packageManager" into package.json
pnpm install
```
Expected: install completes with no errors and writes `pnpm-lock.yaml`. `git status` shows
`pnpm-lock.yaml` created and `packageManager` added to `package.json`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(repo): add pnpm workspace skeleton and root tooling"
```

---

## Task 2: `@octowiz/config-typescript` package

**Files:**
- Create: `packages/config-typescript/package.json`, `base.json`, `node.json`, `vue-nuxt.json`, `README.md`

- [ ] **Step 1: Create `packages/config-typescript/package.json`**

```json
{
  "name": "@octowiz/config-typescript",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./base": "./base.json",
    "./node": "./node.json",
    "./vue-nuxt": "./vue-nuxt.json"
  }
}
```

- [ ] **Step 2: Create `packages/config-typescript/base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "noEmit": true
  }
}
```

- [ ] **Step 3: Create `packages/config-typescript/node.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "types": ["node"]
  }
}
```

- [ ] **Step 4: Create `packages/config-typescript/vue-nuxt.json`** (stub for later)

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve"
  }
}
```

- [ ] **Step 5: Create `packages/config-typescript/README.md`**

```markdown
# @octowiz/config-typescript

Shared TypeScript config presets. Extend one from a package `tsconfig.json`:

- `@octowiz/config-typescript/base` — any TS package
- `@octowiz/config-typescript/node` — Node/library packages
- `@octowiz/config-typescript/vue-nuxt` — Nuxt/Vue layers (not used yet)

All presets extend the repo-root `tsconfig.base.json`, which holds shared strictness.
```

- [ ] **Step 6: Install the workspace link**

Run:
```bash
pnpm install
```
Expected: pnpm registers `@octowiz/config-typescript` as a workspace package, no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(config): add @octowiz/config-typescript presets"
```

---

## Task 3: `@octowiz/config-eslint` package & root eslint config

**Files:**
- Create: `packages/config-eslint/package.json`, `index.js`, `README.md`
- Create: `eslint.config.mjs` (repo root)

- [ ] **Step 1: Create `packages/config-eslint/package.json`**

```json
{
  "name": "@octowiz/config-eslint",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js"
  },
  "scripts": {
    "test": "vitest run"
  },
  "peerDependencies": {
    "eslint": "*"
  }
}
```

- [ ] **Step 2: Create `packages/config-eslint/index.js`**

```js
import antfu from '@antfu/eslint-config'

/**
 * Octowiz ESLint flat-config factory.
 *
 * Wraps @antfu/eslint-config and adds import-boundary rules:
 * packages/* may not import from apps/* or layers/*.
 *
 * @param {Parameters<typeof antfu>[0]} [options] antfu options override
 * @param {...any} userConfigs extra flat-config objects appended last
 */
export default function octowiz(options = {}, ...userConfigs) {
  return antfu(
    {
      type: 'lib',
      // Force TS on: antfu auto-detects via isPackageExists('typescript'), which is
      // false at the monorepo root and would make antfu globally ignore all .ts files,
      // silently turning the boundary rule into a no-op. Pin it true.
      typescript: true,
      jsonc: false,
      yaml: false,
      markdown: false,
      ...options,
    },
    {
      files: ['packages/**/*.{ts,js,vue}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['**/apps/**', '**/layers/**'],
              message: 'packages/* must not import from apps/* or layers/* (see docs/monorepo.md).',
            },
          ],
        }],
      },
    },
    ...userConfigs,
  )
}
```

- [ ] **Step 3: Install eslint deps into config-eslint**

Run:
```bash
pnpm --filter @octowiz/config-eslint add @antfu/eslint-config
pnpm --filter @octowiz/config-eslint add -D eslint vitest
```
Expected: resolved versions written into `packages/config-eslint/package.json`.

- [ ] **Step 4: Create the root `eslint.config.mjs`**

```js
import octowiz from '@octowiz/config-eslint'

export default octowiz()
```

- [ ] **Step 5: Add config-eslint + eslint to the root workspace**

Run:
```bash
pnpm add -w -D eslint
pnpm add -w -D @octowiz/config-eslint@workspace:*
pnpm install
```
Expected: root `package.json` devDependencies include `eslint` and
`@octowiz/config-eslint: "workspace:*"`.

- [ ] **Step 6: Verify lint runs clean on the current tree**

Run:
```bash
pnpm lint
```
Expected: exits 0 (only config files + JS factory exist so far; nothing to flag).

- [ ] **Step 7: Create `packages/config-eslint/README.md`**

```markdown
# @octowiz/config-eslint

Octowiz ESLint flat config: `@antfu/eslint-config` plus import-boundary rules.

Usage (repo root `eslint.config.mjs`):

```js
import octowiz from '@octowiz/config-eslint'
export default octowiz()
```

Boundary rule: files under `packages/**` may not import from `apps/**` or `layers/**`.
The structural layer (pnpm refusing undeclared workspace deps) is the first line of
defence; this lint rule catches relative-path escapes.
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(config): add @octowiz/config-eslint with import boundaries"
```

---

## Task 4: `@octowiz/schemas` proof package (TDD)

**Files:**
- Create: `packages/schemas/package.json`, `src/index.ts`, `src/index.test.ts`, `tsconfig.json`, `README.md`

- [ ] **Step 1: Create `packages/schemas/package.json`**

```json
{
  "name": "@octowiz/schemas",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Create `packages/schemas/tsconfig.json`**

```json
{
  "extends": "../config-typescript/base.json",
  "include": ["src"]
}
```

> Use the **relative path**, not the package specifier `@octowiz/config-typescript/base`.
> vitest/vite-8's OXC transformer (rolldown's native `resolveTsconfig`) does not follow
> pnpm symlinks, so the package-specifier form fails under vitest even though `tsc`
> resolves it. The relative path works for both. This is the convention for all TS
> packages in the workspace.

- [ ] **Step 3: Install dev deps for schemas**

Run:
```bash
pnpm --filter @octowiz/schemas add -D @octowiz/config-typescript@workspace:* typescript vitest
pnpm install
```
Expected: workspace link to config-typescript plus resolved `typescript`, `vitest`.

- [ ] **Step 4: Write the failing test** — `packages/schemas/src/index.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { SCHEMAS_VERSION } from './index'

describe('schemas', () => {
  it('exposes a version constant', () => {
    expect(SCHEMAS_VERSION).toBe('0.0.0')
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run:
```bash
pnpm --filter @octowiz/schemas test
```
Expected: FAIL — cannot resolve `./index` / `SCHEMAS_VERSION` is undefined.

- [ ] **Step 6: Write minimal implementation** — `packages/schemas/src/index.ts`

```ts
export const SCHEMAS_VERSION = '0.0.0' as const

export type SchemasVersion = typeof SCHEMAS_VERSION
```

- [ ] **Step 7: Run the test to verify it passes**

Run:
```bash
pnpm --filter @octowiz/schemas test
```
Expected: PASS (1 test).

- [ ] **Step 8: Type-check and lint**

Run:
```bash
pnpm --filter @octowiz/schemas type-check
pnpm lint
```
Expected: both exit 0.

- [ ] **Step 9: Create `packages/schemas/README.md`**

```markdown
# @octowiz/schemas

Shared schemas and types for rooms, tasks, agents, validations, reviews, escalations,
and PR metadata. Currently a stub (exports `SCHEMAS_VERSION`) that proves the workspace
wiring; real schemas land in a later slice.

Allowed imports: other `packages/*` only.
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(schemas): add stub schemas package with version constant"
```

---

## Task 5: `@octowiz/doctrine` consumer (positive boundary proof)

**Files:**
- Create: `packages/doctrine/package.json`, `src/index.ts`, `tsconfig.json`, `README.md`

- [ ] **Step 1: Create `packages/doctrine/package.json`**

```json
{
  "name": "@octowiz/doctrine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/doctrine/tsconfig.json`**

```json
{
  "extends": "../config-typescript/base.json",
  "include": ["src"]
}
```

> Relative path (not the package specifier) — see the note in Task 4 Step 2 (OXC/vitest
> does not follow pnpm symlinks for tsconfig `extends`).

- [ ] **Step 3: Install deps for doctrine (declares the schemas dependency)**

Run:
```bash
pnpm --filter @octowiz/doctrine add @octowiz/schemas@workspace:*
pnpm --filter @octowiz/doctrine add -D @octowiz/config-typescript@workspace:* typescript
pnpm install
```
Expected: `@octowiz/schemas: "workspace:*"` appears in doctrine's dependencies. This is
the **structural** boundary layer — doctrine may import schemas because it declared it.

- [ ] **Step 4: Write the implementation that consumes schemas** — `packages/doctrine/src/index.ts`

```ts
import { SCHEMAS_VERSION } from '@octowiz/schemas'

/** Records which schemas version this doctrine package was built against. */
export const DOCTRINE_BASED_ON_SCHEMAS = SCHEMAS_VERSION
```

- [ ] **Step 5: Type-check to verify cross-package resolution (the positive proof)**

Run:
```bash
pnpm --filter @octowiz/doctrine type-check
```
Expected: PASS — `@octowiz/schemas` resolves through the workspace link and `exports`
map, and `DOCTRINE_BASED_ON_SCHEMAS` is correctly typed as `"0.0.0"`.

- [ ] **Step 6: Lint**

Run:
```bash
pnpm lint
```
Expected: exits 0 (doctrine imports a package it declared — allowed).

- [ ] **Step 7: Create `packages/doctrine/README.md`**

```markdown
# @octowiz/doctrine

Engineering doctrine rules (no self-review, role separation, merge-readiness, etc.).
Currently a stub that imports `@octowiz/schemas` to prove allowed package→package
imports resolve. Real doctrine logic lands in a later slice.

Allowed imports: other `packages/*` only.
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(doctrine): add stub doctrine package consuming schemas"
```

---

## Task 6: Boundary regression test (negative proof, TDD)

This proves the lint rule actually *fires* on a forbidden import — automatically, every
`pnpm test` run.

**Files:**
- Create: `packages/config-eslint/boundary.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/config-eslint/boundary.test.ts`

```ts
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import octowiz from './index.js'

async function lint(code: string, filePath: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: await octowiz(),
    cwd: process.cwd(),
  })
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
}

describe('import boundaries', () => {
  it('rejects packages importing from apps/*', async () => {
    const messages = await lint(
      'import "../../apps/octowiz-web"\n',
      'packages/schemas/src/probe.ts',
    )
    expect(messages.some(m => m.ruleId === 'no-restricted-imports')).toBe(true)
  })

  it('allows packages importing other workspace packages', async () => {
    const messages = await lint(
      'import { SCHEMAS_VERSION } from "@octowiz/schemas"\nconsole.log(SCHEMAS_VERSION)\n',
      'packages/doctrine/src/probe.ts',
    )
    expect(messages.some(m => m.ruleId === 'no-restricted-imports')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test**

Run:
```bash
pnpm --filter @octowiz/config-eslint test
```
Expected: PASS for both cases. (The rule was authored in Task 3; this test is what
*proves* it works. If the first case fails, the boundary glob is misconfigured — fix
`index.js` until both pass.)

- [ ] **Step 3: Sanity-check the test is real (mutation check)**

Temporarily change the first assertion to `.toBe(false)` and rerun:
```bash
pnpm --filter @octowiz/config-eslint test
```
Expected: FAIL — confirming the test exercises the rule rather than passing vacuously.
Then revert the assertion back to `.toBe(true)` and rerun to confirm PASS.

- [ ] **Step 4: Lint**

Run:
```bash
pnpm lint
```
Expected: exits 0. (The forbidden import lives inside a string literal in the test, not
a real import statement, so the linter does not flag the test file itself.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(config): add automated import-boundary regression test"
```

---

## Task 7 (optional): pnpm catalog for shared versions

Centralises shared dev-tool versions. Optional — do only after Task 8 is green.

**Files:**
- Modify: `pnpm-workspace.yaml`, and the `package.json` files that declared `typescript`/`vitest`/`eslint`

- [ ] **Step 1: Read the resolved versions**

Run:
```bash
pnpm ls -r --depth -1 typescript vitest eslint @antfu/eslint-config
```
Note the resolved version of each.

- [ ] **Step 2: Add a `catalog` block to `pnpm-workspace.yaml`** (substitute the versions from Step 1)

```yaml
catalog:
  typescript: <version-from-step-1>
  vitest: <version-from-step-1>
  eslint: <version-from-step-1>
  "@antfu/eslint-config": <version-from-step-1>
```

- [ ] **Step 3: Replace the version ranges with `catalog:`**

In every `package.json` that declares `typescript`, `vitest`, `eslint`, or
`@antfu/eslint-config`, change the version value to `"catalog:"`. Example for
`packages/schemas/package.json`:

```json
{
  "devDependencies": {
    "@octowiz/config-typescript": "workspace:*",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 4: Reinstall and re-verify**

Run:
```bash
pnpm install
pnpm lint && pnpm -r type-check && pnpm -r test
```
Expected: install clean; all three green (identical resolved versions, now catalog-managed).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(repo): centralise shared dev-tool versions via pnpm catalog"
```

---

## Task 8: Full Definition-of-Done verification

- [ ] **Step 1: Clean install from scratch**

Run:
```bash
rm -rf node_modules packages/*/node_modules
pnpm install
```
Expected: completes cleanly; `pnpm-lock.yaml` unchanged (no diff).

- [ ] **Step 2: Run the full workspace gate**

Run:
```bash
pnpm lint && pnpm -r type-check && pnpm -r test
```
Expected: all exit 0. Confirms:
- positive boundary check — `@octowiz/doctrine` type-checks against `@octowiz/schemas`;
- negative boundary check — `boundary.test.ts` proves `packages/* → apps/*` is rejected;
- proof package test passes.

- [ ] **Step 3: Confirm the Definition of Done from the spec**

Tick each against the spec `docs/superpowers/specs/2026-06-20-repo-foundation-design.md`:
- [ ] `pnpm install` clean with committed lockfile
- [ ] `pnpm lint`, `pnpm -r type-check`, `pnpm -r test` all green
- [ ] Positive boundary check passes (doctrine ← schemas)
- [ ] Negative boundary check passes (boundary regression test)

- [ ] **Step 4: Final commit (if anything uncommitted)**

```bash
git add -A
git commit -m "chore(repo): repo foundation slice complete" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Workspace topology & root tooling (spec §1) → Task 1.
- Shared config packages (spec §2) → Tasks 2 (TS) and 3 (ESLint).
- Two-layer import boundaries (spec §3) → structural via declared deps in Tasks 4/5;
  lint rule in Task 3; proven by Tasks 5 (positive) and 6 (negative).
- Workspace scripts (spec §4) → Task 1 root scripts (`lint`, `lint:fix`, `type-check`,
  `test`).
- Proof slice (spec §5) → Tasks 4 (schemas) and 5 (doctrine).
- Error handling / failure modes (spec §6) → `onlyBuiltDependencies` (Task 1), boundary
  lint failing the gate (Tasks 3/6).
- Definition of Done (spec) → Task 8.
- pnpm catalog (spec §1) → Task 7 (optional, flagged deviation).
- Deferred items (`.nuxtrc`, SecretLint, commit-message gate, Turborepo) → out of scope
  per spec Non-Goals; not implemented here.

**Type/name consistency:** `SCHEMAS_VERSION` (schemas) is the single exported symbol;
`DOCTRINE_BASED_ON_SCHEMAS` consumes it; `octowiz()` is the config-eslint factory used
identically in `eslint.config.mjs` and `boundary.test.ts`. Package names
(`@octowiz/config-typescript`, `@octowiz/config-eslint`, `@octowiz/schemas`,
`@octowiz/doctrine`) are consistent across all tasks.

**Placeholder scan:** the only `<...>` placeholders are in Task 7 Step 2 (catalog
versions), which are intentionally resolved live in Step 1 — not plan gaps.
