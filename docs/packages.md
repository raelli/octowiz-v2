# Packages
This document describes packages currently present under `packages/`.
## `packages/config-eslint`
Shared linting rules for TypeScript, Vue/Nuxt, import boundaries, unused code, and avoiding casual `any`.
## `packages/config-typescript`
Shared TypeScript configuration presets for apps, layers, packages, and Node/Vue/Nuxt projects.
## `packages/schemas`
Shared schemas and types for rooms, tasks, agents, validations, reviews, escalations, and PR metadata.
## `packages/doctrine`
Runtime and policy rules, including no self-review and merge readiness constraints.
## `packages/room-ledger`
Persistent room/task/participant state and event history used to track workflow progress.
## `packages/zellij-adapter`
Integration layer for creating and managing Zellij sessions used by Octowiz workflows.
## `packages/opencode-adapter`
Integration layer for OpenCode task execution and repo/task context handoff.
## `packages/github-adapter`
GitHub operations including branches, commits, pull requests, review metadata, and reporting hooks.
## `packages/aelli-adapter`
ÆLLI escalation integration for passing context and recording advisor outputs.
## `packages/sandbox-runtime`
Sandbox lifecycle and isolation runtime for room execution environments.
## `packages/agent-runtime`
Agent orchestration/runtime logic for assignment, execution, and role constraints.
## `packages/skill-runtime`
Skill discovery/loading/selection runtime used by task execution flows.
## `packages/validation`
Validation orchestration and result normalization for workspace/package checks.
