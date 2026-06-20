# Foundation Guardrails Implementation Plan

> **For agentic workers:** implement task-by-task; verify each gate functionally before committing.

**Goal:** Add the three deferred Milestone 2 guardrails to the octowiz-v2 foundation: secret scanning (secretlint), a commit-message quality gate (commitlint), and package/layer README templates. Git hooks are managed by simple-git-hooks + lint-staged.

**Architecture:** Workspace-root dev tooling. Hooks installed by `simple-git-hooks` (config in root `package.json`): a `pre-commit` hook runs `lint-staged` (which runs `secretlint` over staged files), and a `commit-msg` hook runs `commitlint` against the conventional-commits config. README templates live under `docs/templates/`.

**Tech Stack:** pnpm 11, simple-git-hooks, lint-staged, secretlint (+ recommend preset), @commitlint/cli (+ config-conventional). Versions resolved live via `pnpm add` — not hand-pinned.

**Base:** branch `chore/foundation-guardrails` off merged `main` (`6fca558`).

---

## Task 1: Secret scanning + commit-message gate + hooks

**Files:**
- Modify: root `package.json` (devDeps, `simple-git-hooks` + `lint-staged` config, `prepare` + `secrets` scripts)
- Create: `.secretlintrc.json`, `commitlint.config.mjs`
- Modify: `pnpm-workspace.yaml` catalog (optional — add the new shared tool versions)

- [ ] **Step 1: Install dev tooling at the workspace root**

```bash
pnpm add -w -D simple-git-hooks lint-staged secretlint @secretlint/secretlint-rule-preset-recommend @commitlint/cli @commitlint/config-conventional
```
Resolved versions are written live. NOTE: `simple-git-hooks` has a `postinstall` build script. pnpm 11 ERRORS (`ERR_PNPM_IGNORED_BUILDS`) on any dependency build script without an explicit decision, so you must record it in `pnpm-workspace.yaml` under `allowBuilds:` (`simple-git-hooks: true`). That is the pnpm 11 supply-chain guardrail — no separate `onlyBuiltDependencies` entry is needed.

- [ ] **Step 2: Create `.secretlintrc.json`**

```json
{
  "rules": [
    { "id": "@secretlint/secretlint-rule-preset-recommend" }
  ]
}
```

- [ ] **Step 3: Create `commitlint.config.mjs`**

```js
export default {
  extends: ['@commitlint/config-conventional'],
}
```

- [ ] **Step 4: Add config + scripts to root `package.json`**

Add a `secrets` script, a `prepare` script (installs hooks on `pnpm install`), and the `simple-git-hooks` + `lint-staged` blocks:

```jsonc
{
  "scripts": {
    // ...existing lint / lint:fix / type-check / test...
    "secrets": "secretlint \"**/*\"",
    "prepare": "simple-git-hooks"
  },
  "simple-git-hooks": {
    "pre-commit": "pnpm exec lint-staged",
    "commit-msg": "pnpm exec commitlint --edit"
  },
  "lint-staged": {
    "*": "secretlint"
  }
}
```

> Note on hook invocation: `simple-git-hooks` forwards the git hook arguments to the
> command, so `commitlint --edit` receives the commit-message file path as a positional
> argument. If your installed versions need it spelled differently (e.g. `commitlint
> --edit $1`), adjust so the FUNCTIONAL tests in Steps 6–7 pass — but keep the intent
> (commit-msg → commitlint; pre-commit → lint-staged → secretlint).

- [ ] **Step 5: Install the hooks and confirm install is clean**

```bash
pnpm install            # runs prepare -> simple-git-hooks
pnpm exec simple-git-hooks   # idempotent re-install; prints the hooks it wired
```
Expected: prints that `pre-commit` and `commit-msg` hooks were set. No errors.

- [ ] **Step 6: FUNCTIONAL test — commit-message gate rejects a bad message**

```bash
git commit --allow-empty -m "bad message no type" 2>&1 | tail -15; echo "exit: ${PIPESTATUS[0]}"
```
Expected: NON-zero exit; commitlint complains (e.g. "subject may not be empty" / "type may not be empty"). The empty commit must NOT be created. If it WAS created, remove it: `git reset --hard HEAD~1` is wrong for empty — use `git reset --soft HEAD~1` only if a commit landed. Verify with `git log --oneline -1` that no "bad message" commit exists.

Then confirm a GOOD message passes:
```bash
git commit --allow-empty -m "chore: verify commitlint accepts conventional messages" 2>&1 | tail -5
git log --oneline -1   # should show the chore: commit
git reset --hard HEAD~1   # remove the throwaway empty commit
```

- [ ] **Step 7: FUNCTIONAL test — secretlint catches a staged secret**

Create a file with an obvious fake secret, stage it, attempt commit:
```bash
printf 'const AWS_SECRET_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"\nconst k = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"\n' > /tmp/secret-probe.txt
cp /tmp/secret-probe.txt ./__secret_probe.ts
git add __secret_probe.ts
git commit -m "test: secret probe (should be blocked)" 2>&1 | tail -20; echo "exit: ${PIPESTATUS[0]}"
```
Expected: NON-zero exit; secretlint (via lint-staged pre-commit) flags the secret and blocks the commit. Then clean up:
```bash
git reset __secret_probe.ts 2>/dev/null; rm -f __secret_probe.ts; git status --short
```
Confirm no probe commit landed (`git log --oneline -1`) and no probe file remains.

> If secretlint's recommended preset does not flag the AWS-style key, try a clearly
> detectable token it does support (consult the installed preset's rules) so the test
> genuinely proves pre-commit secret scanning works. The test must demonstrate a real
> block, not pass vacuously.

- [ ] **Step 8: Confirm the existing gate still passes**

```bash
pnpm lint && pnpm -r type-check && pnpm -r test
```
Expected: all green (we added config, no source changes).

- [ ] **Step 9: Commit (use a conventional message — your own gate now applies)**

```bash
git add -A
git commit -m "chore(repo): add secretlint + commitlint gates via simple-git-hooks"
```
Confirm the commit succeeds (your own commit message is conventional, so commitlint passes) and that `__secret_probe.ts` is NOT included (`git show --stat HEAD`).

---

## Task 2: Package/layer README templates

**Files:**
- Create: `docs/templates/package-readme.md`, `docs/templates/layer-readme.md`

- [ ] **Step 1: Create `docs/templates/package-readme.md`**

```markdown
# @octowiz/<package-name>

> One-line statement of this package's single responsibility.

## Purpose

What this package does and why it exists.

## Allowed imports

- Other `packages/*` only. (Packages must NOT import from `apps/*` or `layers/*` — enforced by the import-boundary lint rule.)

## Exported entrypoints

- `.` — <describe the public API exported from `src/index.ts`>

## Ownership / domain boundary

<Which domain this owns; what is explicitly out of scope.>

## Examples

\`\`\`ts
import { something } from '@octowiz/<package-name>'
\`\`\`
```

- [ ] **Step 2: Create `docs/templates/layer-readme.md`**

```markdown
# layer: <layer-name>

> One-line statement of this Nuxt layer's responsibility.

## Purpose

What product surface or capability this layer provides.

## Allowed imports

- `packages/*`. Avoid importing sibling `layers/*` unless the relationship is deliberate and documented here.

## Provides

- Components / composables / pages / config this layer contributes to consuming apps.

## Ownership / domain boundary

<What this layer owns; what belongs elsewhere.>

## Examples

<How an app composes this layer.>
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs(templates): add package and layer README templates"
```

---

## Task 3: Verify + finish

- [ ] **Step 1: Full gate from a clean state**

```bash
pnpm install
pnpm lint && pnpm -r type-check && pnpm -r test && pnpm secrets
```
Expected: all green; `pnpm secrets` scans the repo and reports no secrets.

- [ ] **Step 2: Confirm hooks are real (one more bad-commit attempt)**

```bash
git commit --allow-empty -m "nope" 2>&1 | tail -5; echo "exit: ${PIPESTATUS[0]}"
```
Expected: blocked (non-zero), no commit created.

- [ ] **Step 3: Push and open PR** against `main`.

---

## Definition of Done

1. `secretlint` blocks a staged secret on pre-commit (proven functionally) and `pnpm secrets` scans the repo.
2. `commitlint` rejects a non-conventional commit message on commit-msg (proven functionally) and accepts conventional ones.
3. Hooks install automatically via the `prepare` script on `pnpm install`.
4. `docs/templates/package-readme.md` and `layer-readme.md` exist and match the fields required by `docs/monorepo.md`.
5. Existing gate (`pnpm lint` / `-r type-check` / `-r test`) stays green; no stray probe files committed.
