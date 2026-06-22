# Architecture

## Core Idea

Octowiz is a multiplayer AI engineering system.

It combines:

- shared coding rooms
- human steering
- agent-driven implementation
- adversarial code review
- validation loops
- GitHub-based delivery
- escalation to ÆLLI for higher-level reasoning

## Multiplayer First

Octowiz is designed as a multiplayer system from the beginning.

Zellij is a core part of the architecture because it provides the native shared terminal/session model needed for real collaborative coding rooms.

```text
Zellij = the multiplayer room
```

## OpenCode as the Coding Cockpit

OpenCode is the primary coding cockpit.

Octowiz should not duplicate features that OpenCode already provides.

```text
OpenCode = where code is actually written and modified
```

The principle is:

> Zellij provides the multiplayer room. OpenCode provides the coding cockpit. Octowiz orchestrates the engineering workflow.

## Doctrine Over Raw Model Power

Octowiz must not depend on every agent being a frontier model.

Quality should come from process:

- clear task decomposition
- role separation
- adversarial review
- validation loops
- no self-approval
- escalation when needed

This is especially important for local and self-hosted worker models such as Qwen running on private GPU infrastructure.

## No Self-Review

No agent or human should be the sole approver of their own implementation.

```text
Agent A implements.
Agent B reviews.
Agent C validates.
ÆLLI advises if needed.
Human approves merge.
```

Implementation and review must be separated.

## Initial Runtime Direction

Octowiz-v2 should begin as a pragmatic local-first developer tool.

Initial assumptions:

- GitHub is the main source control platform.
- Zellij is used for shared terminal sessions.
- OpenCode is used as the coding cockpit.
- Local models may run on private GPU infrastructure.
- Stronger models may be accessed through ÆLLI when needed.
- Room state should be stored in simple files or lightweight storage at first.
- Each room should run inside an isolated sandbox boundary.
- The MVP may use rootless Docker/Podman for speed.
- The target architecture is MicroVM-per-Room.
- Sandbox providers must be replaceable.
- The system should be scriptable before it becomes heavily UI-driven.

Implementation order:

```text
CLI first
simple API second
Nuxt web UI third
```

## The Doctrine Runtime

This is what makes Octowiz-v2 a **product**, not a skill set, and the reason it exists rather
than continuing the Claude-Code octowiz plugin. The plugin is skills + hooks *decorating*
Anthropic's closed app. Octowiz-v2 runs on **OpenCode as embeddable infrastructure it owns**.

```text
Claude Code = an app you can only decorate.
OpenCode    = infrastructure you can own, embed, and enforce through.
```

### OpenCode as engine, not just cockpit

- `opencode serve` (headless HTTP / OpenAPI) + `@opencode-ai/sdk` let Octowiz drive OpenCode
  programmatically per room, own the session lifecycle (create/fork/export/import), and present
  its own cockpit (CLI → API → Nuxt).
- `opencode attach <url>` gives multiplayer on one server, complementing the Zellij room.

### Doctrine as enforcement (the highest product value)

Doctrine is a **mechanism, not a prompt the model may ignore**. Enforced at native layers, with
custom code only where config cannot reach:

- **`permission` config** — bash/edit allow·ask·deny by pattern (e.g. deny `git push`, scope
  edits to `src/**`). Zero code.
- **per-agent `permission`** — the reviewer agent gets `edit: deny`, making **no-self-review
  structural**, not hoped-for. Zero code.
- **`AGENTS.md` / `instructions`** — doctrine auto-loads into every session and persists across
  them; `instructions` can pull shared/remote doctrine so a team's rules are centralized. Zero code.
- **plugins (`tool.execute.before`)** — only for conditional/stateful rules a static pattern
  cannot express (e.g. *no commit until validation has passed*). Minimal code.

### Global system prompt — injected server-side by LiteLLM (requirement)

**Requirement:** octowiz-v2 MUST tag its LiteLLM requests (a payload tag / metadata field) that
triggers LiteLLM to **pre-inject a global octowiz system prompt server-side** — exactly the way
the AELLI model already gets its system prompt injected at the LiteLLM layer. This octowiz system
prompt is a **customization of the existing AELLI system prompt** injected via LiteLLM.

Why server-side rather than per-client: the base operating prompt stays consistent across every
session and every user, owned and updated in one place (the LiteLLM layer) instead of copied into
each client. The exact tag/metadata key and the prompt content are configured with the LiteLLM
admin, aligned to the AELLI precedent.

**Decision — global doctrine delivery (Path A):** the agent operating rules (and other global
octowiz doctrine) are **folded into this octowiz system prompt**, making them unconditionally
present in every octowiz-v2 request — server-side, all users, no hook or bootstrap dependency.
This stays an **octowiz-scoped feature**: it is gated by the octowiz tag and is **never injected
into plain Claude Code sessions** (no Claude Code SessionStart hook). opencode has no clean
session-start system-prompt hook, so the LiteLLM tag is its native, unconditional answer.

### Persistent, compounding doctrine

`tool.execute.after` captures actions into the room-ledger → feeds ÆLLI's
experience → reflection → playbook loop → re-seeded into the next session. Doctrine doesn't just
persist; it **improves** across sessions. This is the learning half that the stateless plugin
model can never own.

### ÆLLI integration — brain/tentacle, not a merge

ÆLLI stays the **brain**: A2A router (model-tier routing + generate→review→revise with built-in
no-self-approval), memory/reflection, escalation. Octowiz calls it through the `aelli-adapter`
seam (a single injected A2A client). Octowiz-v2 **supersedes the Claude-Code octowiz plugin** by
re-platforming its worker role onto OpenCode; ÆLLI is reused unchanged, not rebuilt.

### Control topology — human-driven peer

Octowiz-v2 is a **human-driven peer**, not a headless subordinate worker: the human drives the
room in OpenCode/Zellij; Octowiz enforces doctrine locally and calls ÆLLI for advice, review, or
escalation when needed.
