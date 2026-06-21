# M11 — Composition / Integration Milestone

**Status:** Approved design (2026-06-21)
**Type:** Integration milestone — wires merged runtime packages into a runnable end-to-end MVP flow.

## Problem statement

The MVP packages (M1–M10) are all merged to `main` and unit-green, but they are
islands. The CLI (`scripts/octowiz.ts`) composes only `sandbox → zellij → opencode →
validate`. The runtime libraries — `agent-runtime`, `skill-runtime`, `github-adapter`,
`aelli-adapter` — are imported by nobody outside their own package (`aelli-adapter`
only by `agent-runtime`). They are well-tested, seam-injected libraries, but nothing
composes them into the "create room → assign task to agent → validate → separate
review → GitHub PR → escalate to ÆLLI → select skills" flow the MVP definition of done
describes. The building blocks exist; the integration does not.

M11 turns the merged islands into a working MVP by wiring them at the composition root
and proving all 10 MVP features work **together** in one acceptance run.

## Scope decisions (aligned 2026-06-21)

1. **Acceptance-run realism:** real validation (actual `pnpm` via the `Run` seam) +
   fixtures at the external boundaries. M11 proves the composition wiring
   deterministically and CI-safe; de-faking each external seam is the separate
   item #2 (out of scope below).
2. **CLI surface:** discrete composable subcommands (`assign`, `review`, `escalate`,
   `deliver`, `skills`) plus a thin `run-task` that chains them — mirroring the
   existing `up` command that chains `create-room` + `start`.
3. **Skill selection:** build a thin pure `selectSkills(skills, ctx)` now (it is named
   in the MVP flow and is small and unit-testable), rather than deferring it.

## Locked design assumptions (grounded in the seams)

- **Implementer = OpenCode in the sandbox** (already wired by the `start` command).
  `agent-runtime` has *no* apply-patch/commit seam — `AgentWorker` returns `{ text }`
  only, so it cannot emit a diff. The code change comes from OpenCode.
- **`agent-runtime` workers = reviewer / validator / advisor roles** — they produce
  text verdicts/advice recorded to the ledger, with `doctrine.canReview` enforcing
  reviewer ≠ implementer.
- **The only genuinely net-new code is composition wiring** in `scripts/octowiz.ts`,
  plus two small pure helpers (`selectSkills` and diff-capture). Everything else is
  *calling existing seams* — no new abstractions, no new package.

## Proposed solution

### Composition root & `Deps` extension

The composition root stays in `scripts/octowiz.ts`. Extend `Deps` with four new
fields (three injected seams — `worker`, `aelliClient`, `readFile` — plus the
`skillRegistryPath`), wired to their **real** constructors/values in the entrypoint;
tests and the acceptance run inject fakes through the same `Deps`.

```ts
interface Deps {
  ledger: RoomLedger
  run: Run
  now: () => string
  provider: SandboxProvider
  worker: AgentWorker          // reviewer/advisor roles (createLocalModelWorker in prod)
  aelliClient: AelliClient     // aelli-adapter heavy seam (stub in prod for now → de-fake = item #2)
  readFile: ReadFile           // skill-runtime registry load (defaultReadFile in prod)
  skillRegistryPath: string    // 'skills/registry.json'
}
```

M11 wires seams to their real constructors at the entrypoint, but the **local-model
binary, real ÆLLI client, real gh/git delivery, and real container** stay as item #2 —
the wiring is real, the external backends are deferred.

The assign → validate → review → escalate → deliver chain lives in a new focused
module `scripts/orchestrate.ts` exporting `orchestrate(deps, args)`, called by the
`run-task` command — the same injected-seam, unit-testable shape as the existing
`runCli(argv, deps)`.

### New components

Each subcommand calls one existing seam and records to the ledger.

| Subcommand | Seam called | Ledger effect |
|---|---|---|
| `assign --room --task --agent` | `ledger.assignTask(...)` + `setTaskStatus(in_progress)` | `task.assigned`, `task.status_changed` |
| `skills --room --task [--role]` | `loadApprovedSkills(readFile, path)` → **new** `selectSkills(skills, ctx)` | prints selection; no schema change |
| `review --room --task --reviewer --verdict` | **new** diff-capture → `dispatchReview({...})` (enforces `canReview`) | `review.recorded` |
| `escalate --room --task` | `shouldEscalate(state, task)` → `buildEscalationRequest` → `recordAelliEscalation(...)` | `escalation.recorded` (only if triggered) |
| `deliver --room --task --branch [--base main]` | `isMergeReady` gate → `generatePullRequestBody` → `openPullRequestForBranch` | none (prints PR URL) |
| `run-task ...` | chains assign → (start) → validate → review → escalate? → deliver | all of the above |

**Two net-new pure helpers** (the only invented code):

- `selectSkills(skills: Skill[], ctx: SkillContext): Skill[]` in `skill-runtime` —
  matches each `Skill.triggers` (taskType / role / workflowStep / repoStack /
  filePaths / …) against a task context and returns the matching skills. Pure,
  unit-tested. Wired into the `skills` subcommand and `run-task`.
- **diff-capture**: `gitDiff(workdir, run): Promise<string>` — `git -C <workdir> diff`,
  feeds the reviewer prompt. In the acceptance run this is the **fixture diff**.

### Data flow (`run-task`)

```
assign      → ledger: task.assigned + status in_progress
start        → sandbox.create → zellij.ensureSession → opencode.startArgs   (implementer = OpenCode; SKIPPED/fixture in acceptance)
[diff]       → gitDiff(workdir) → patch text                                 (fixture patch in acceptance)
validate     → runValidation(DEFAULT_CHECKS, run, now) → ledger: validation.recorded   (REAL pnpm)
skills       → loadApprovedSkills → selectSkills(ctx)
review       → dispatchReview(prompt=diff, verdict) → ledger: review.recorded   (canReview enforced)
escalate?    → if shouldEscalate(state): recordAelliEscalation → ledger: escalation.recorded
deliver      → if isMergeReady(state): generatePullRequestBody + openPullRequestForBranch → PR URL
```

## Error handling & gates

- **No self-review:** `dispatchReview` consumes `doctrine.canReview`; throws if the
  reviewer is the implementer or lacks the reviewer role.
- **Fail-closed escalation:** `recordAelliEscalation` throws if no `reason` before
  touching ÆLLI or the ledger; `escalate` is a no-op when `shouldEscalate` returns
  false.
- **Merge gate:** `deliver` refuses unless `isMergeReady` (latest validation passed +
  at least one approving review from a qualified reviewer, by ledger append order). A
  blocked / rejected / failed task → `run-task` escalates instead of delivering.
- **Ledger append-order contract (#9):** preserved — M11 only calls existing reducers,
  so "latest" stays append-order, never `createdAt`.

## Testing

- **Unit** per subcommand and per helper, injecting fakes via `Deps` (memory ledger
  store, stub worker, recording `Run`).
- **E2E acceptance test** (`scripts/__tests__/acceptance.e2e.ts` or equivalent) drives
  `run-task` once with fixtures and asserts **all 10 MVP features**:

| # | MVP feature | Proven by |
|---|---|---|
| 1 | Create room | `create-room` |
| 2 | Zellij session | `start` |
| 3 | OpenCode | `start` (argv asserted) |
| 4 | Assign task to one agent | `assign` → `task.assigned` |
| 5 | Record task state in ledger | ledger events accumulate |
| 6 | Run validation | `validate` (REAL pnpm on fixture workspace) |
| 7 | Separate reviewer | `review` via `dispatchReview` + `canReview` |
| 8 | Escalate to ÆLLI | `escalate` via `shouldEscalate` + stub `aelliClient` |
| 9 | GitHub-ready PR summary | `deliver`: body generated + recording `Run` asserts git/gh argv |
| 10 | Status via CLI then web | `status` JSON **and** assert `apps/octowiz-web` server route projects the same `RoomState` from the ledger (no browser) |

## Faked vs de-faked (per scope decision 1)

- **Real:** validation (`pnpm` via `Run`), ledger (file store), doctrine, skill load +
  select, all pure adapter logic.
- **Faked at boundaries for the acceptance run:** implementer diff (fixture),
  reviewer/advisor worker (scripted verdicts), `aelliClient` (stub recommendation),
  gh/git (recording `Run`, no network), container (existing seam, stub/skip).

## Out of scope (explicit)

- **Item #2 de-faking:** real local-model worker binary, real ÆLLI client, gated real
  gh/git smoke, real container runtime smoke.
- **Item #3 polish:** dual-render room id, ReviewPanel verdict colors,
  registry-completeness guard, a `pr.opened` ledger event (no schema change in M11).
- **Autonomous driving of OpenCode:** the implementer remains human/OpenCode-driven;
  M11 records the assignment, it does not auto-pilot the model.

## Definition of done

- All 10 MVP features demonstrated **together** by one green acceptance run.
- Discrete subcommands (`assign`, `review`, `escalate`, `deliver`, `skills`) +
  `run-task` wired through the extended `Deps`.
- `selectSkills` + diff-capture (`gitDiff`) added and unit-tested.
- Entrypoint wires real seam constructors (`createLocalModelWorker`, `defaultReadFile`,
  stub `aelliClient`).
- Full gate green: `pnpm lint`, `pnpm -r type-check`, `pnpm -r test`.
