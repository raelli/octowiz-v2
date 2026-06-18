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
