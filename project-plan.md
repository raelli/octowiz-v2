# Octowiz Concept Plan

## 1. Product Name

**Octowiz** is the product name.

For the initial experimental repository, the working repository name may be:

```text
octowiz-v2
```

This avoids conflict with the existing `raelli/octowiz` repository while keeping the long-term product direction clear.

The product positioning is:

> **Octowiz — the coding tentacle of ÆLLI.**

Octowiz is not a standalone chatbot, not just another coding wrapper, and not merely an AI coding assistant. Octowiz is the multiplayer coding layer of ÆLLI: the place where humans, coding agents, validators, reviewers, and higher-level orchestration meet inside shared engineering rooms.

---

## 2. Core Idea

Octowiz is a **multiplayer AI engineering system**.

It combines:

- shared coding rooms
- human steering
- agent-driven implementation
- adversarial code review
- validation loops
- GitHub-based delivery
- escalation to ÆLLI for higher-level reasoning

The central idea is simple:

> Humans and AI agents should not work as isolated solo coders. They should collaborate in structured engineering rooms with shared context, clear roles, review doctrine, and enforceable quality gates.

Octowiz exists to make that possible.

---

## 3. Relationship Between ÆLLI and Octowiz

### ÆLLI

ÆLLI is the higher-level intelligence and control brain.

ÆLLI is responsible for:

- strategic reasoning
- system-level architecture guidance
- doctrine and quality principles
- cross-room awareness
- escalation when smaller agents are stuck
- high-level decision support
- final advisory judgment when there is uncertainty

ÆLLI is not the low-level coding worker. ÆLLI is the intelligence layer that can guide, evaluate, arbitrate, and escalate.

### Octowiz

Octowiz is the coding tentacle of ÆLLI.

Octowiz is responsible for:

- coding sessions
- task execution
- agent orchestration
- shared engineering rooms
- implementation loops
- review loops
- validation loops
- GitHub branch and pull request workflows
- multiplayer collaboration

In short:

```text
ÆLLI = higher-level intelligence / control brain
Octowiz = coding layer / multiplayer engineering tentacle
```

---

## 4. Product Vision

Octowiz should become a multiplayer AI coding environment where humans and agents can work together in real time.

The goal is not just to generate code.

The goal is to create a structured engineering system where code is:

1. planned,
2. implemented,
3. reviewed,
4. challenged,
5. validated,
6. improved,
7. and only then prepared for merge.

Octowiz should support both live collaboration and autonomous agent execution.

The long-term vision:

> Octowiz becomes the engineering execution layer of ÆLLI: a multiplayer workspace where human developers and AI agents collaborate under explicit quality doctrine.

---

## 5. Why Octowiz Exists

Most AI coding tools are optimized for a single-user interaction model:

```text
Human asks.
AI edits.
Human reviews.
```

That model is useful, but limited.

Octowiz is designed around a different model:

```text
Human steers.
Agents implement.
Other agents review.
Validation checks run.
ÆLLI advises when needed.
Humans approve final direction.
```

This enables:

- parallel development
- stronger review discipline
- better use of smaller local models
- persistent coding rooms
- multiplayer interaction
- auditable decisions
- structured escalation
- repeatable quality loops

Octowiz should make AI-assisted engineering feel less like prompting a single assistant and more like operating a disciplined software team.

---

## 6. Key Principles

### 6.1 Multiplayer First

Octowiz should be designed as a multiplayer system from the beginning.

The system should support shared sessions where multiple humans and agents can observe, steer, and interact with the same engineering environment.

This is why **Zellij** is a core part of the architecture.

Zellij provides the native shared terminal/session model needed for real multiplayer coding.

### 6.2 OpenCode as the Coding Cockpit

OpenCode should be treated as the primary coding cockpit.

Octowiz should avoid duplicating features that OpenCode already provides.

The architecture should not create unnecessary panes, dashboards, or abstractions just for the sake of visual complexity.

The principle is:

> Zellij provides the multiplayer room. OpenCode provides the coding cockpit. Octowiz orchestrates the engineering workflow.

### 6.3 Doctrine Over Raw Model Power

Octowiz should not depend on every agent being a frontier model.

The system should assume that some agents may be smaller, cheaper, local, or self-hosted models.

Quality should come from process:

- clear task decomposition
- role separation
- adversarial review
- validation loops
- no self-approval
- escalation when needed

This is especially important for setups using local models such as Qwen running on private GPU infrastructure.

### 6.4 No Self-Review

A core doctrine rule:

> No agent or human should be the sole approver of their own implementation.

Implementation and review must be separated.

Example:

```text
Agent A implements.
Agent B reviews.
Agent C validates.
ÆLLI advises if needed.
Human approves merge.
```

### 6.5 Human Steering Remains Central

Octowiz is not designed to remove humans from the engineering process.

Humans should remain able to:

- create tasks
- steer coding rooms
- inspect work
- interrupt agents
- request alternative approaches
- approve or reject changes
- make final product decisions

The system should feel like a powerful engineering cockpit, not a black box.

---

## 7. Initial Architecture

The initial architecture should combine four major layers:

```text
ÆLLI
└── Octowiz
    ├── Zellij multiplayer sessions
    ├── OpenCode coding cockpit
    ├── Agent orchestration
    ├── Sandbox Runtime
    ├── Validation and review loops
    └── GitHub delivery workflow
```

---

## 8. System Layers

### 8.1 Zellij Multiplayer Layer

Zellij provides the multiplayer execution environment.

Responsibilities:

- create shared coding sessions
- allow humans to join live rooms
- allow agents to operate inside persistent sessions
- support multiple parallel engineering rooms
- preserve terminal state
- provide real-time visibility into coding work

Zellij is the room.

### 8.2 OpenCode Layer

OpenCode provides the coding cockpit.

Responsibilities:

- interactive coding
- file editing
- agent coding interaction
- terminal-based development
- codebase-aware implementation
- possible web-based serving through OpenCode functionality

OpenCode is where code is actually written and modified.

### 8.3 Octowiz Orchestration Layer

Octowiz coordinates the coding process.

Responsibilities:

- task intake
- task decomposition
- role assignment
- room creation
- agent assignment
- implementation workflow
- review workflow
- validation workflow
- escalation routing
- GitHub branch and PR handling
- doctrine enforcement

Octowiz decides who does what, in which room, under which quality rules.

### 8.4 ÆLLI Advisory Layer

ÆLLI provides higher-level reasoning and control.

Responsibilities:

- architecture guidance
- doctrine management
- escalation support
- conflict resolution
- reasoning over failed validation
- advice for stuck agents
- strategic product and technical direction

ÆLLI is called when the local process needs stronger reasoning.

---

### 8.5 Sandbox Runtime

Octowiz uses a dedicated **Sandbox Runtime** as a core architecture layer.

Because Octowiz is intended to operate with broad engineering permissions, it must not execute powerful actions directly on the host system by default. Instead, every coding room should run inside an isolated sandbox boundary.

The goal is not to restrict Octowiz unnecessarily. The goal is to give Octowiz as much useful engineering power as possible while protecting the host system, unrelated repositories, global secrets, production infrastructure, and other active rooms.

The target architecture is:

```text
One Octowiz Room = One Sandbox Boundary
One Octowiz Room = One Workspace Boundary
One Octowiz Room = One Git Branch Boundary
One Octowiz Room = One Agent Team Boundary
```

The long-term target sandbox model is:

```text
MicroVM-per-Room
```

This means each Octowiz room should eventually run inside its own lightweight virtual machine with its own filesystem, processes, networking boundary, Zellij session, OpenCode process, agent processes, and validation environment.

For the MVP, Octowiz may begin with rootless container sandboxes for implementation speed. However, containers must be treated as an implementation shortcut, not as the final architecture. The Sandbox Runtime must be provider-based so Octowiz can move from rootless containers to Kata Containers, Firecracker, or another MicroVM backend without rewriting the orchestration layer.

Recommended sandbox phases:

```text
Phase 1: Rootless Docker/Podman sandbox per room
Phase 2: Kata Containers or another VM-backed container runtime
Phase 3: Firecracker MicroVM-per-Room with warm pools and snapshots
Phase 4: Multi-tenant MicroVM fleet for product/SaaS usage
```

Each room sandbox should contain:

- repository workspace
- Zellij session
- OpenCode process
- agent processes
- Git tooling
- validation tooling
- local development services
- task-specific environment variables
- controlled secrets
- artifact and log collection

Inside the sandbox, Octowiz should be allowed to:

- edit files
- install dependencies
- run tests
- run builds
- start local services
- create branches
- prepare commits
- prepare pull requests
- collect logs and artifacts
- run implementation, review, and validation agents

Outside the sandbox, Octowiz must be denied by default from:

- accessing host filesystem paths outside the mounted workspace
- reading global SSH keys
- reading global cloud credentials
- accessing production deployment credentials
- mounting the host Docker socket
- running privileged containers
- using host network mode without explicit approval
- mounting `/`
- modifying unrelated repositories
- starting uncontrolled paid cloud resources
- deploying to production

A critical rule:

```text
Never mount /var/run/docker.sock into an agent sandbox by default.
```

Mounting the host Docker socket would allow an agent to control the host through Docker. That would turn the sandbox into decorative theater with YAML, which is not the desired security model.

The Sandbox Runtime should eventually support warm MicroVM pools:

```text
Sandbox Manager
├── Warm MicroVM Pool
│   ├── node-base
│   ├── python-base
│   ├── rust-base
│   ├── fullstack-base
│   └── gpu-agent-base
│
├── Active Room MicroVMs
│   ├── room-001
│   ├── room-002
│   └── room-003
│
└── Snapshot Manager
```

This allows Octowiz to avoid cold-starting every room from zero. A room can be created from a prepared base image, connected to a repo/branch, started with Zellij and OpenCode, and then handed to humans and agents.

The final product principle:

> Octowiz should be MicroVM-first in its target architecture. The MVP may begin with rootless containers, but the Sandbox Runtime must be designed around replaceable providers so Firecracker/Kata-based MicroVMs can become the main backend later.

---

## 9. Room Model

Octowiz should support multiple room types.

### 9.1 Shared Coding Room

A shared coding room is used for live collaboration.

Example:

```text
Room: Feature Planning & Implementation
Participants:
- Janis
- Human collaborator
- Implementation agent
- Review agent
- Validation agent
```

Use cases:

- live coding
- mob programming
- pair programming with agents
- debugging
- architectural exploration
- human-guided implementation

### 9.2 Parallel Task Room

A parallel task room is used when several tasks should be worked on at the same time.

Example:

```text
Room A: Authentication refactor
Room B: GitHub adapter implementation
Room C: Zellij session manager
Room D: Review and validation
```

Each room may have its own:

- Zellij session
- OpenCode instance
- assigned agents
- branch
- task ledger
- validation state

### 9.3 Review Room

A review room is focused only on critique and improvement.

Use cases:

- adversarial review
- architecture review
- security review
- test coverage review
- refactor suggestions
- merge readiness review

### 9.4 Validation Room

A validation room is focused on running checks.

Use cases:

- test execution
- linting
- type checks
- build verification
- integration tests
- reproducibility checks

---

## 10. Agent Roles

Octowiz should support explicit agent roles.

### 10.1 Planner Agent

Creates or refines the implementation plan.

Responsibilities:

- understand task requirements
- inspect relevant code
- propose implementation steps
- identify risks
- define validation requirements

### 10.2 Implementation Agent

Writes the code.

Responsibilities:

- implement the task
- follow the plan
- make minimal but complete changes
- update relevant files
- avoid unrelated refactors
- document important decisions

### 10.3 Review Agent

Critiques the implementation.

Responsibilities:

- find bugs
- challenge assumptions
- check architecture fit
- verify doctrine compliance
- review maintainability
- request changes

The review agent must not be the same agent that implemented the code.

### 10.4 Validation Agent

Runs checks and reports results.

Responsibilities:

- run tests
- run linters
- run type checks
- run builds
- inspect failures
- summarize validation status

### 10.5 Refactor Agent

Improves structure after functionality is working.

Responsibilities:

- reduce complexity
- improve naming
- remove duplication
- simplify implementation
- preserve behavior

### 10.6 ÆLLI Escalation Advisor

Used when the system needs stronger reasoning.

Responsibilities:

- resolve uncertainty
- propose better architecture
- help with difficult bugs
- review conflicting agent opinions
- make final advisory recommendations

---

## 11. Standard Workflow

A normal Octowiz task should follow this flow:

```text
1. Human creates or approves task
2. Octowiz creates a room
3. Planner agent inspects code and creates plan
4. Human or ÆLLI approves or adjusts plan if needed
5. Implementation agent writes code
6. Validation agent runs checks
7. Review agent performs adversarial review
8. Implementation agent fixes issues
9. Different reviewer re-checks if needed
10. ÆLLI is consulted if uncertainty remains
11. Pull request is created or updated
12. Human approves final merge
```

---

## 12. Quality Doctrine

Octowiz should enforce explicit quality doctrine.

Initial doctrine rules:

### 12.1 No Self-Approval

The implementer cannot be the final reviewer.

### 12.2 Review Before Merge

Every meaningful change must pass review before merge.

### 12.3 Validation Before PR Ready

A task is not PR-ready until validation has run or has been explicitly waived.

### 12.4 Failed Checks Must Be Explained

If tests, linting, type checks, or builds fail, the failure must be explained.

### 12.5 Waivers Must Be Recorded

If a check is skipped, ignored, or waived, the reason must be recorded.

### 12.6 Human Override Is Allowed

Humans can override the system, but the override should be visible in the task ledger.

### 12.7 Escalate When Stuck

If local agents loop without progress, Octowiz should escalate to ÆLLI.

---

## 13. GitHub Workflow

Octowiz should integrate with GitHub as the delivery layer.

Expected capabilities:

- create branches
- commit changes
- open pull requests
- update pull requests
- comment on pull requests
- attach review summaries
- attach validation results
- track unresolved review issues
- prevent accidental self-approval
- map rooms to branches or PRs

Suggested branch naming:

```text
octowiz/<task-id>-short-description
```

Example:

```text
octowiz/042-zellij-session-manager
```

Suggested PR structure:

```markdown
## Summary

What changed and why.

## Implementation Notes

Important technical details.

## Validation

- [ ] Tests
- [ ] Lint
- [ ] Type check
- [ ] Build

## Review

Reviewer:
Review status:
Open issues:

## ÆLLI Escalation

Was escalation used?
Decision summary:
```

---

## 14. Room Ledger

Octowiz should maintain a room ledger.

The room ledger is the persistent memory of what happened inside a coding room.

It should record:

- room ID
- task ID
- participants
- assigned agents
- active branch
- linked PR
- plan
- decisions
- validation results
- review findings
- waivers
- escalations
- final outcome

Example:

```json
{
  "room_id": "room_042",
  "task_id": "task_042",
  "title": "Implement Zellij session manager",
  "branch": "octowiz/042-zellij-session-manager",
  "participants": ["janis", "agent-planner", "agent-impl-qwen", "agent-reviewer"],
  "status": "review_required",
  "validation": {
    "tests": "passed",
    "lint": "passed",
    "typecheck": "failed"
  },
  "review": {
    "reviewer": "agent-reviewer",
    "status": "changes_requested",
    "open_issues": 3
  },
  "escalations": [
    {
      "to": "aelli",
      "reason": "Type architecture uncertainty",
      "summary": "ÆLLI recommended separating session state from process supervisor."
    }
  ]
}
```

---

## 15. MVP Scope

The first MVP should stay focused.

The goal is not to build the entire final product immediately.

The MVP should prove:

> A human can create a coding room, run OpenCode inside a shared Zellij session, assign a task to an agent, run validation, produce a review, and create a GitHub-ready change.

### MVP Features

1. Create a new coding room
2. Spawn or attach to a Zellij session
3. Start OpenCode inside the session
4. Assign a task to an implementation agent
5. Run a validation command
6. Run a separate review agent
7. Store room ledger data
8. Create or prepare a GitHub branch/PR
9. Escalate to ÆLLI manually when needed

### MVP Non-Goals

The MVP should not initially require:

- full autonomous multi-agent scheduling
- perfect browser UI
- full permission system
- advanced billing
- enterprise workspace management
- complex dashboards
- over-engineered pane layouts
- replacing OpenCode functionality

Avoid building theater. Build the working tentacle first.

---

## 16. Suggested Repository Structure

Initial repository structure:

```text
octowiz-v2/
├── README.md
├── CONCEPT.md
├── docs/
│   ├── architecture.md
│   ├── doctrine.md
│   ├── room-ledger.md
│   ├── sandbox.md
│   ├── mvp.md
│   └── workflows.md
│
├── apps/
│   ├── api/
│   ├── web/
│   └── worker/
│
├── packages/
│   ├── zellij-adapter/
│   ├── opencode-adapter/
│   ├── github-adapter/
│   ├── aelli-adapter/
│   ├── agent-runtime/
│   ├── sandbox-runtime/
│   ├── doctrine/
│   ├── room-ledger/
│   └── validation/
│
├── examples/
│   ├── room-ledger.example.json
│   └── task.example.md
│
└── scripts/
    ├── create-room.sh
    ├── start-opencode.sh
    └── run-validation.sh
```

---

## 17. Package Responsibilities

### `zellij-adapter`

Responsible for:

- creating Zellij sessions
- attaching users to sessions
- managing session names
- spawning panes when needed
- exposing shared session access

### `opencode-adapter`

Responsible for:

- starting OpenCode
- passing repo/task context
- integrating OpenCode commands
- avoiding duplicated coding UI logic

### `github-adapter`

Responsible for:

- branches
- commits
- pull requests
- PR comments
- review summaries
- validation reports

### `aelli-adapter`

Responsible for:

- escalating questions to ÆLLI
- passing room context
- passing code/review/validation summaries
- storing ÆLLI recommendations

### `agent-runtime`

Responsible for:

- abstracting local and remote agents
- supporting Qwen/local models
- supporting API-based stronger models
- assigning roles
- tracking agent output

### `sandbox-runtime`

Responsible for:

- creating isolated room sandboxes
- supporting provider-based sandbox backends
- starting rootless container sandboxes for the MVP
- preparing MicroVM-per-Room backends for the target architecture
- injecting approved secrets and environment variables
- enforcing workspace, network, and resource boundaries
- collecting logs and artifacts
- destroying, freezing, or snapshotting sandboxes
- preventing host-level access by default

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

### `doctrine`

Responsible for:

- no self-review rule
- validation requirements
- waiver rules
- merge readiness rules
- role separation
- review requirements

### `room-ledger`

Responsible for:

- persistent room state
- task state
- participant state
- decision history
- validation history
- review history
- escalation history

### `validation`

Responsible for:

- running configured checks
- parsing results
- reporting failures
- attaching validation status to ledger and PRs

---

## 18. Technical Direction

The system should likely begin as a pragmatic local-first developer tool.

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
- Sandbox providers must be replaceable so the system can evolve toward Kata Containers, Firecracker, or another MicroVM backend.
- The system should be scriptable before it becomes heavily UI-driven.

A practical first implementation could use:

```text
CLI first
simple API second
web UI third
```

This keeps the MVP grounded and prevents early frontend complexity from slowing down the core proof.

---

## 19. Possible First Milestones

### Milestone 1: Repo Foundation

- Create `octowiz-v2`
- Add README
- Add concept documentation
- Add initial architecture docs
- Define room ledger schema
- Define doctrine rules

### Milestone 2: Sandbox Runtime Foundation

- Add `packages/sandbox-runtime`
- Define `SandboxProvider` interface
- Add rootless Docker/Podman provider for MVP
- Define MicroVM-per-Room as target backend
- Add sandbox policy defaults
- Deny host Docker socket by default
- Deny privileged mode by default
- Add artifact/log collection concept

### Milestone 3: Manual Room Creation

- Add script to create Zellij session
- Add script to start OpenCode in session
- Add simple room ledger file
- Add manual task file format

### Milestone 4: Agent Role Prototype

- Add implementation agent runner
- Add review agent runner
- Add validation runner
- Enforce no self-review in metadata

### Milestone 5: GitHub Flow

- Create branch from task
- Commit changes
- Generate PR body
- Attach validation summary
- Attach review summary

### Milestone 6: ÆLLI Escalation

- Add manual escalation command
- Send room/task context to ÆLLI
- Store recommendation in room ledger
- Allow recommendation to influence next action

### Milestone 7: Multiplayer Web Entry

- Provide browser-accessible room/session entry
- Support joining an active room
- Show room status
- Show linked task/branch/PR

---

## 20. Example Task Flow

Example task:

```text
Task: Implement Zellij session manager
```

Flow:

```text
1. Janis creates task.
2. Octowiz creates room `room_001`.
3. Zellij session `octowiz-room-001` starts.
4. OpenCode starts inside the session.
5. Planner agent creates implementation plan.
6. Implementation agent writes session manager.
7. Validation agent runs tests.
8. Review agent critiques code.
9. Implementation agent fixes issues.
10. Review agent confirms.
11. Octowiz prepares GitHub PR.
12. Human approves final merge.
```

---

## 21. Product Differentiation

Octowiz is differentiated by the combination of:

- multiplayer coding rooms
- agent role separation
- local and remote model support
- structured review doctrine
- explicit validation loops
- GitHub delivery workflow
- ÆLLI escalation
- human steering
- persistent room ledger

The product should not compete only as “another AI coding assistant.”

It should position itself as:

> A multiplayer AI engineering system for human-agent software teams.

---

## 22. Long-Term Vision

In the long term, Octowiz should support:

- multiple simultaneous coding rooms
- multiple human collaborators
- multiple agent teams
- competing implementations
- automatic review rotation
- stronger validation pipelines
- persistent engineering memory
- team-level dashboards
- GitHub-native review automation
- reusable workflow templates
- project-specific coding doctrine
- deeper integration with ÆLLI
- advanced local model orchestration

Eventually, Octowiz should become the default coding execution layer for ÆLLI-powered engineering work.

---

## 23. North Star

The north star for Octowiz:

> Octowiz is the coding tentacle of ÆLLI — a multiplayer AI engineering system where humans and agents collaborate in shared coding rooms, with structured implementation, adversarial review, validation loops, GitHub delivery, and escalation to higher-level intelligence when needed.

Everything in the repository should serve that direction.

If a feature does not improve multiplayer engineering, code quality, agent coordination, review discipline, or delivery clarity, it probably does not belong in the MVP.
