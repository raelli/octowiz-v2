# Packages

## `packages/schemas`

Shared schemas and types for rooms, tasks, agents, validations, reviews, escalations, and PR metadata.

Use Zod or Valibot. The exact choice can be made during implementation, but schemas must be shared and versioned.

## `packages/doctrine`

Responsible for:

- no self-review rule
- role separation
- validation requirements
- waiver rules
- merge readiness rules
- review requirements

## `packages/room-ledger`

Responsible for:

- persistent room state
- task state
- participant state
- decision history
- validation history
- review history
- escalation history

The MVP can store this as structured files or lightweight SQLite. The interface should not assume the storage backend is permanent.

## `packages/zellij-adapter`

Responsible for:

- creating Zellij sessions
- attaching users to sessions
- managing session names
- spawning panes only when needed
- exposing shared session access

## `packages/opencode-adapter`

Responsible for:

- starting OpenCode
- passing repo/task context
- integrating OpenCode commands
- avoiding duplicated coding UI logic

## `packages/sandbox-runtime`

Responsible for:

- creating isolated room sandboxes
- supporting provider-based sandbox backends
- starting rootless container sandboxes for MVP
- preparing MicroVM-per-Room backends for the target architecture
- injecting approved secrets and environment variables
- enforcing workspace, network, and resource boundaries
- collecting logs and artifacts
- destroying, freezing, or snapshotting sandboxes

Initial providers:

```text
podman.provider.ts
docker.provider.ts
```

Future providers:

```text
kata.provider.ts
firecracker.provider.ts
gvisor.provider.ts
e2b.provider.ts
daytona.provider.ts
```

## `packages/agent-runtime`

Responsible for:

- abstracting local and remote agents
- supporting Qwen/local models
- supporting stronger API-based models through ÆLLI escalation
- assigning roles
- tracking agent output
- enforcing no self-review at runtime

## `packages/skill-runtime`

Responsible for:

- discovering and loading skills
- importing approved external skill patterns
- supporting Octowiz-native operational doctrine
- selecting skills based on task type, repo stack, role, workflow step, file paths, validation failures, and room policy
- composing multiple skills for a single task
- resolving conflicts according to Octowiz doctrine and sandbox policy
- exposing selected skill instructions to OpenCode, agents, and ÆLLI escalation
- recording active skills and skill decisions in the room ledger

Initial files:

```text
skill-registry.ts
skill-loader.ts
skill-trigger-matcher.ts
skill-composer.ts
skill-conflict-resolver.ts
skill-ledger-recorder.ts
```

## `packages/validation`

Responsible for running configured checks, parsing results, reporting failures, and attaching validation status to ledger and PRs.

## `packages/github-adapter`

Responsible for branches, commits, pull requests, PR comments, review summaries, and validation reports.

## `packages/aelli-adapter`

Responsible for escalating questions to ÆLLI, passing room context, passing code/review/validation summaries, and storing ÆLLI recommendations.

## `packages/arena-runtime`

Responsible for multi-agent solution comparison, human ranking, optional LLM-as-judge later, and preserving human ranking as authoritative for MVP.

## `packages/config-eslint`

Shared linting rules for TypeScript, Vue/Nuxt, import boundaries, unused code, and avoiding casual `any`.

## `packages/config-typescript`

Shared TypeScript configuration presets for apps, layers, packages, Node services, and Vue/Nuxt projects.

## `packages/design-tokens`

Shared product design tokens for colors, spacing, typography, semantic UI tokens, and later brand/product themes.
