# Tooling

## Baseline Stack

```text
Package manager: pnpm
Workspace:       pnpm workspaces
Runtime:         Node.js through mise
Frontend:        Nuxt / Vue
Server/API:      Nitro where useful, Node packages for core runtime
Language:        TypeScript strict
Validation:      package-level and workspace-level checks
Linting:         shared ESLint config package
Secrets:         SecretLint or equivalent
Git hooks:       pre-commit and commit-message quality gates
```

## Root Files

Root files should include:

```text
.editorconfig
.npmrc
.nuxtrc
mise.toml
package.json
pnpm-workspace.yaml
tsconfig.base.json
```

## Supply-Chain Guardrails

The workspace should use pnpm catalogs for shared dependency version control where practical.

The root should include supply-chain guardrails:

- pinned or catalog-controlled dependency versions
- `minimumReleaseAge` where practical
- restricted build scripts by default
- explicit dependency trust policy
- lockfile committed
- no implicit package manager switching

## Nuxt, Not React

The web layer should use **Nuxt/Vue/Nitro**, not React, unless Janis explicitly approves an exception later.

React is not part of the preferred Octowiz-v2 stack.
