# Product Direction

## Product Name

**Octowiz** is the product name.

The repository `octowiz-v2` is the new experimental and product-facing development line for the multiplayer AI engineering system.

The positioning is:

> **Octowiz — the coding tentacle of ÆLLI.**

## Responsibility Split

```text
ÆLLI    = main brain / A2A control plane / memory / orchestration / escalation
Octowiz = coding tentacle / OpenCode-first multiplayer execution layer
```

ÆLLI remains the higher-level intelligence: orchestration brain, A2A control plane, memory layer, model router, senior advisor, and escalation gateway.

Octowiz is the execution layer for shared coding rooms, agent coordination, skill routing, review doctrine, validation loops, and GitHub delivery workflows.

## Core Workflow

```text
Human steers.
Agents implement.
Other agents review.
Validation checks run.
ÆLLI advises when needed.
Humans approve final direction.
```

The system must feel like a structured engineering cockpit, not a black box.

## Strong Product Boundary

Octowiz-v2 is not:

- a Claude Code compatibility project
- a React app
- a generic dashboard wrapped around agents
- a replacement for OpenCode functionality

Octowiz-v2 is the OpenCode-first, Zellij-powered, pnpm/Nuxt monorepo for multiplayer AI engineering under ÆLLI's higher-level orchestration.

If a feature does not improve multiplayer engineering, code quality, agent coordination, review discipline, or delivery clarity, it probably does not belong in the MVP.

## Why OpenCode, not Claude Code

The current octowiz is "just a skill set" because it is skills + hooks bolted onto Claude Code —
a closed app you can only *decorate*, never own. Octowiz-v2 exists to cross the line from skill
set to **product**, and that is only possible on OpenCode:

```text
Claude Code = an app you can only decorate.
OpenCode    = infrastructure you can own, embed, and enforce through.
```

If Octowiz-v2 does not exploit what OpenCode gives over Claude Code — embeddability
(`serve` + SDK), tool-boundary enforcement (plugins + permissions), and owned session lifecycle —
then there is no reason to build it over evolving the plugin. Those capabilities are the mandate.

## Product Scope

**Differentiating core — the Doctrine Runtime** (see `architecture.md`): doctrine enforced as a
mechanism (permissions + guard plugins), persisted and compounding across sessions (ledger →
ÆLLI reflection), on OpenCode embedded as the engine. This is where effort goes; it is what the
plugin can never be. Highest single value: **enforcement** (doctrine followed, not hoped).

**In scope:** the doctrine runtime; OpenCode-embedded multiplayer Zellij rooms; review /
validation / no-self-review / delivery doctrine; ÆLLI integration via A2A; CLI → API → Nuxt cockpit.

**Out of scope — reuse, do not rebuild:** the brain (ÆLLI's router, memory, reflection); model
serving (LiteLLM); doctrine *content* authoring (that is a human + grill-with-docs activity).

**Boundary test:** if a feature is not enforcement, cross-session persistence, or multiplayer
engineering under doctrine, it is not core.
