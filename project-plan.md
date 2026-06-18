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

Octowiz is the coding tentacle of ÆLLI: the OpenCode-first execution layer for shared coding rooms, agent coordination, skill routing, review doctrine, validation loops, and delivery workflows.

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

ÆLLI is the top-level intelligence and main brain of the framework. Repo-based, ÆLLI is the A2A control plane for routing, memory, engineering knowledge, multi-model orchestration, and escalation.

ÆLLI is responsible for:

- A2A routing and agent-card based skill dispatch
- memory and engineering knowledge integration
- multi-model orchestration through LiteLLM/model routes
- task classification and escalation routing
- generation-review workflow control
- preventing a generator from approving its own output
- senior architecture, risk, and conflict escalation
- cross-room and cross-session intelligence
- persisting reusable project experience and playbooks

ÆLLI is not the low-level coding worker and not the shared coding UI. ÆLLI is the main brain / control plane that routes, remembers, advises, escalates, and coordinates the intelligence layer behind Octowiz.

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
ÆLLI = main brain / A2A control plane / routing, memory, orchestration, escalation
Octowiz = coding tentacle / OpenCode-first multiplayer execution layer
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

## 6. Human Collaboration Roles

The initial human collaboration model is:

- Janis: product owner, system designer, and primary steering authority
- Bo: active Vibecoding collaborator
- Dennis: technical advisor, reviewer, and architecture sparring partner; optionally an active coding participant when explicitly needed

Dennis' feedback must be treated as technical advisory input, especially around developer steering, workflow control, architecture risk, code quality, and engineering practicality.

Dennis may join coding rooms as an active contributor, but the default assumption for the MVP is that he primarily advises, reviews, challenges assumptions, and helps steer architecture and implementation quality.

Dennis should therefore be represented in Octowiz as both:

```text
default role: technical advisor / reviewer
optional role: active coder
```

Octowiz should allow Dennis to:

- review plans before execution
- review implementation proposals
- challenge architecture decisions
- inspect diffs
- request changes
- join a shared Zellij/OpenCode room
- actively code when invited into that role

---

## 7. Key Principles

### 7.1 Multiplayer First

Octowiz should be designed as a multiplayer system from the beginning.

The system should support shared sessions where multiple humans and agents can observe, steer, and interact with the same engineering environment.

This is why **Zellij** is a core part of the architecture.

Zellij provides the native shared terminal/session model needed for real multiplayer coding.

### 7.2 OpenCode as the Coding Cockpit

OpenCode should be treated as the primary coding cockpit.

Octowiz should avoid duplicating features that OpenCode already provides.

The architecture should not create unnecessary panes, dashboards, or abstractions just for the sake of visual complexity.

The principle is:

> Zellij provides the multiplayer room. OpenCode provides the coding cockpit. Octowiz orchestrates the engineering workflow.

### 7.3 Doctrine Over Raw Model Power

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

### 7.4 No Self-Review

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

### 7.5 Human Steering Remains Central

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

## 8. Initial Architecture

Octowiz-v2 should be a monorepo that combines the relevant parts of the existing ÆLLI and Octowiz directions into one integrated framework. This does not mean simply copying both repositories into one folder. It means designing one monorepo where ÆLLI provides the top-level intelligence/control plane and Octowiz provides the coding execution layer required by the new OpenCode/Zellij workflow.

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

## 9. System Layers

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

### 8.3 Coding Runtime Strategy

Octowiz-v2 is OpenCode-first.

Octowiz-v2 does not aim to remain Claude Code compatible. Claude Code compatibility belongs to the existing Octowiz v1 line.

The purpose of Octowiz-v2 is to build the new multiplayer Vibecoding architecture around:

- OpenCode as the coding runtime
- Zellij as the shared multiplayer room
- Octowiz as the engineering workflow, memory, routing, role-orchestration, skill, and doctrine layer
- ÆLLI as orchestration brain, senior advisor, and A2A gateway
- Qwen 35B on the Trooper GPU Server as local worker, reviewer, and fixer model
- stronger models through ÆLLI only for escalation, architecture, risk, ambiguity, and conflict resolution

Octowiz-v2 should not spend MVP effort on Claude Code compatibility, Claude Code adapters, or migration support from Octowiz v1 unless Janis explicitly approves it later.

### 8.3.1 Monorepo Integration Strategy

Octowiz-v2 should be designed as the new integrated monorepo for the combined ÆLLI + Octowiz framework.

The monorepo should preserve a clear separation of responsibility:

```text
ÆLLI = main brain / A2A control plane / memory / routing / model orchestration / escalation
Octowiz = coding tentacle / OpenCode-first execution layer / rooms / agents / skills / validation / delivery
```

The purpose of combining the repos is not to blur the product concepts. It is to allow the coding workflow to work as one system:

- ÆLLI provides routing, memory, model orchestration, engineering knowledge, and escalation.
- Octowiz provides shared Zellij rooms, OpenCode execution, sandboxed room runtime, agent coordination, skill composition, validation, review loops, GitHub delivery, and Arena Mode.
- The skill runtime, room ledger, and escalation protocol should be shared across the monorepo.
- Existing ÆLLI capabilities may need to be adapted so their old Claude Code assumptions are replaced by OpenCode/Zellij-aware interfaces.
- Existing Octowiz concepts may need to be rebuilt as Octowiz-v2-native packages rather than imported unchanged from v1.

Suggested monorepo package direction:

```text
apps/
├── aelli-control-plane/
├── octowiz-api/
├── octowiz-web/
└── octowiz-worker/

packages/
├── a2a-gateway/
├── memory/
├── model-router/
├── engineering-knowledge/
├── room-ledger/
├── zellij-adapter/
├── opencode-adapter/
├── sandbox-runtime/
├── agent-runtime/
├── skill-runtime/
├── validation/
├── github-adapter/
├── arena-runtime/
└── doctrine/
```

The architectural rule is:

> ÆLLI is the main brain. Octowiz is the coding tentacle. The monorepo exists so both can operate as one coherent engineering framework.

### 8.4 Octowiz Orchestration Layer

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

### 8.5 ÆLLI Main Brain / Control Plane Layer

ÆLLI provides the top-level intelligence of the framework. In octowiz-v2, ÆLLI should be adapted where necessary so it can operate as the main brain for the new OpenCode/Zellij-based workflow instead of remaining only tied to the older Claude Code-oriented v1 workflow.

Responsibilities:

- A2A gateway and skill routing
- model routing and multi-model orchestration
- memory, engineering knowledge, and playbook retrieval
- cross-room awareness
- escalation support
- architecture guidance
- conflict resolution
- reasoning over failed validation
- senior review and risk assessment
- advisor routing for stronger models
- preserving no-self-review workflow separation

ÆLLI is called when the local process, Qwen workers, skill composition, reviewers, or humans need stronger reasoning, architecture judgment, or escalation. ÆLLI should not replace Octowiz as the coding execution layer; it coordinates and empowers it.

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

## 11. Room Model

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


### 9.5 Arena Mode

Arena Mode is a competitive-comparative execution mode for Octowiz.

The goal is not entertainment first. The goal is better engineering outcomes through controlled competition, systematic comparison, and synthesis of the strongest parts of multiple independent solutions. The gamification layer should make the process more engaging, but code quality remains the primary objective.

Arena Mode should allow Janis, Boris, and Dennis to work on the same task in parallel while customizing their agent configurations, skill composition, model settings, and steering style.

Default human roles in Arena Mode:

```text
Janis = product owner, steering authority, arena participant
Boris = active Vibecoding participant, arena participant
Dennis = technical advisor/reviewer-first, optional active arena participant/coder
```

Arena Mode should support three competing lanes:

```text
Arena Task
├── Lane A: Janis configuration
├── Lane B: Boris configuration
└── Lane C: Dennis configuration
```

Each lane may define:

- agent model
- model parameters
- skill families and skill priorities
- allowed tools
- runtime constraints
- sandbox profile
- review strictness
- validation strategy
- prompting / doctrine profile
- cost and latency limits

Every lane must run in an isolated sandbox boundary and must produce comparable artifacts.

Comparable artifacts should include:

- implementation plan
- code diff
- tests added or changed
- validation output
- review notes
- risk notes
- cost / runtime metrics
- final summary

Arena Mode must support human ranking and, later, optional LLM-as-a-judge assistance. Human ranking remains authoritative for MVP.

Ranking dimensions should include:

- correctness
- code quality
- maintainability
- architecture fit
- type safety
- test quality
- minimality of change
- risk profile
- readability
- developer experience
- validation success
- cost / latency efficiency

Arena Mode should not only pick a winner. It should synthesize the best parts of all lanes into a final candidate solution.

The expected arena flow is:

```text
1. Create shared arena task
2. Define participants and lane configurations
3. Run read-only diagnosis and planning per lane
4. Human steering checkpoint
5. Execute lanes in isolated sandboxes
6. Collect diffs, tests, validation, and summaries
7. Compare lane outputs side-by-side
8. Rank outputs using human votes and rubric scores
9. Extract strongest parts of each lane
10. Create synthesis plan
11. Generate final integrated candidate
12. Review final candidate under normal Octowiz doctrine
13. Record arena outcome in the room ledger
```

Arena Mode must obey the existing Octowiz doctrine:

- no self-review
- diagnosis before autonomous fixes
- human steering before meaningful execution
- sandbox isolation per lane
- validation before merge readiness
- explicit stop rules
- ÆLLI escalation for architecture, risk, ambiguity, and conflicts

Arena Mode should be designed as an internal research and quality mode first. It can later become a visible product feature with leaderboards, badges, score history, and configuration tournaments.

Recommended prior-art direction:

- Use Chatbot Arena / LMArena-style pairwise comparison as the ranking inspiration.
- Use Bradley-Terry or Elo-style scoring later if enough comparisons are collected.
- Use LLM-as-a-judge only as assistance, not as the sole decision-maker.
- Inspect existing OSS evaluation tools before building custom ranking infrastructure.

Candidate OSS components to inspect before building from scratch:

- FastChat / Chatbot Arena concepts for pairwise comparison and arena UX.
- promptfoo or similar LLM evaluation tooling for repeatable eval configuration.
- OpenAI Evals / Inspect-style evaluation frameworks for structured eval tasks.
- Prometheus-style open evaluator models for optional pairwise judging.
- GitTaskBench-style repository-task evaluation ideas for code-agent task quality.

Octowiz should not directly copy a generic chatbot arena. A coding arena must compare code artifacts, diffs, tests, validation results, architecture fit, and reviewer feedback. The arena substrate can be inspired by existing OSS, but the product layer must be Octowiz-native.

---

## 12. Agent Roles

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

## 13. Standard Workflow

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

## 14. Multiplayer Steering Doctrine

The target collaboration model is a shared Vibecoding room, not isolated local solo sessions connected only through GitHub pull requests.

The core room model is:

```text
Janis + Bo
inside one shared Zellij-powered Vibecoding session
with OpenCode as the coding runtime
with Octowiz orchestrating workflow, skills, memory, roles, and doctrine
with ÆLLI available for escalation
with Dennis primarily advising and reviewing, and optionally coding when invited into that role
```

Focus:

```text
Code quality > UX magic
```

However, the system must still feel like a shared remote coding room. Zellij should provide the multiplayer session layer. OpenCode should provide the coding runtime. Octowiz should provide the workflow, room ledger, role orchestration, skill routing, validation routing, review doctrine, and escalation logic.

Developers must be able to steer early before agents start making meaningful changes. Every substantial task should support a pre-execution steering phase:

```text
1. Task intake
2. Read-only inspection
3. Initial plan
4. Human steering checkpoint
5. Agent execution
6. Validation
7. Review
8. Improvement loop
9. Merge readiness
```

Dennis' feedback must be treated as a product requirement here: developers need early steering before agents run ahead. Octowiz must avoid the pattern where agents immediately modify files after receiving a vague task.

---

## 15. Diagnosis Gate Doctrine

Bugs, setup issues, failing tests, dependency problems, environment problems, and toolchain failures must not be fixed autonomously by default.

Before Octowiz changes files, it must pass a read-only Diagnosis Gate.

Required diagnosis output:

```text
Problem summary:
Observed evidence:
Affected files/systems:
Likely root causes:
Hypotheses:
Confidence per hypothesis:
Risk level:
Recommended next action:
Requires human confirmation:
Yes/No
```

Octowiz may proceed without human confirmation only when:

- confidence is high
- blast radius is low
- the change is local and reversible
- no secrets, credentials, infrastructure, production, or dependency-wide changes are involved
- the action fits existing project doctrine

Octowiz must ask for human confirmation when:

- confidence is medium or low
- multiple plausible root causes exist
- the fix touches architecture
- the fix changes dependencies
- the fix changes configuration
- the fix changes build or deployment behavior
- the fix could hide a deeper issue
- the fix affects production or credentials

The Diagnosis Gate exists to prevent helpful autonomous fixes that make the system worse.

---

## 16. Quality Doctrine

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

## 17. GitHub Workflow

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

## 18. Room Ledger

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

## 19. MVP Scope

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

## 20. Skill Integration Strategy

Octowiz should not invent a generic skill catalog from scratch. The initial skill layer must be built from the concrete skill marketplace and the four approved skill families that Janis selected for Octowiz-v2.

Approved skill source configuration:

```json
{
  "extraKnownMarketplaces": {
    "my-org": {
      "source": "url",
      "url": "https://llm.integrahub.de/claude-code/marketplace.json"
    }
  }
}
```

This marketplace is the authoritative source for the external skills Octowiz-v2 should consider. Do not import random public GitHub skill repositories into the core architecture while this marketplace is available. Public repositories may be used for research only, not as active upstreams, unless Janis explicitly approves them later.

### 20.1 Approved Initial Skill Families

For the initial Octowiz-v2 repo, only these skill families should be used or integrated:

```text
1. superpowers
2. mattpocock
3. antfu
4. octowiz
```

Everything else in the marketplace is out of scope for the first implementation, even if it looks useful. The system should be deliberately narrow at first. Otherwise the skill layer turns into a buffet where every agent returns with a plate full of mutually incompatible opinions.

### 20.2 Role of Each Approved Skill Family

#### Superpowers

Superpowers is the process backbone and meta-discipline layer.

Use it for:

- planning before implementation
- selecting the right skill before acting
- checking assumptions
- preventing agents from skipping workflow steps
- forcing explicit reasoning checkpoints
- breaking large work into controlled steps
- keeping autonomous loops from becoming chaotic

Superpowers should trigger early in most non-trivial Octowiz tasks. It acts as the operational discipline layer that tells the agent how to work, when to stop, when to verify, and when to use another skill.

#### Matt Pocock

Matt Pocock-style skills are the TypeScript quality layer.

Use them for:

- TypeScript correctness
- strict type design
- inference-friendly APIs
- Zod/schema patterns
- typed adapters
- avoiding weak `any`-based implementations
- refactoring TypeScript safely
- framework-safe TypeScript patterns

These skills should trigger whenever Octowiz works on TypeScript-heavy areas such as:

```text
packages/*
apps/api/
apps/web/
agent-runtime/
github-adapter/
skill-runtime/
sandbox-runtime/
```

#### antfu

antfu-style skills are the frontend, tooling, monorepo, and DX doctrine layer.

Use them for:

- Vite/Nuxt/Vue ecosystem conventions when relevant
- modern frontend tooling
- package structure
- linting and formatting discipline
- monorepo hygiene
- clean config design
- developer experience
- lightweight open-source maintainability patterns

These skills should trigger when Octowiz touches frontend, tooling, package configuration, linting, formatting, build setup, or monorepo ergonomics.

#### Octowiz

Octowiz skills are the memory, routing, role-orchestration, room doctrine, and delivery skills for Octowiz-v2.

Use them for:

- Octowiz-native room orchestration
- Zellij and OpenCode workflow control
- sandbox operations
- branch and PR delivery flows
- room ledger updates
- ÆLLI escalation packaging
- Octowiz product doctrine

Do not treat Octowiz v1 skills as an approved upstream family for the initial implementation. Older Octowiz material may be used as background research only when Janis explicitly provides or approves it, but it should not be imported as an active skill source.

### 20.3 Marketplace Allowlist Policy

The Octowiz-v2 skill runtime must support marketplace discovery, but the initial policy is allowlist-only.

Allowed from `my-org` marketplace:

```text
superpowers
mattpocock
antfu
octowiz
```

Denied by default:

```text
all other marketplace skills
all unverified public GitHub skill repos
all community mirrors not explicitly approved by Janis
all skills that request host-level privileges without sandbox policy approval
```

This does not mean the other marketplace skills are bad. It means they are not part of the first Octowiz-v2 architecture. Octowiz should first prove that the four core families can be composed reliably.

### 20.4 Mandatory Skill Capability Audit and Composition Design

Before Octowiz imports, rebuilds, or operationalizes any skill, the first task is a capability audit. The goal is to define what Octowiz must be able to do, then map the four approved skill families to those capabilities.

Do not begin by wiring skills directly into agents. Begin by auditing Octowiz itself. Otherwise the system risks becoming a prompt collage instead of a deliberate engineering runtime.

The audit must answer:

```text
1. What must Octowiz be able to do as a product?
2. Which capabilities are core for the MVP?
3. Which capabilities belong to the sandbox/runtime layer?
4. Which capabilities belong to Zellij/OpenCode room control?
5. Which capabilities belong to agent planning, implementation, review, validation, and delivery?
6. Which capabilities need TypeScript/frontend/tooling quality doctrine?
7. Which capabilities need process discipline before action?
8. Which capabilities need Octowiz-native product doctrine?
9. Which capabilities require ÆLLI escalation?
10. Which capabilities should explicitly not be automated yet?
```

The audit output should be stored in:

```text
docs/skill-capability-audit.md
docs/skill-composition-strategy.md
skills/registry.json
```

The audit should map each Octowiz capability to one or more approved skill families:

```text
superpowers  = process discipline, planning, verification, workflow hygiene
mattpocock   = TypeScript correctness, type design, schema/API safety
antfu        = frontend, tooling, monorepo, linting, formatting, DX conventions
octowiz      = product-native room, sandbox, GitHub, validation, and ÆLLI workflows
```

The composition design must define when these skillsets combine. Example:

```text
Task: Implement typed GitHub PR adapter
- Superpowers: force planning, assumption checks, review checkpoints
- Matt Pocock: enforce strict TypeScript and inference-safe API design
- Octowiz: enforce branch, PR, room-ledger, validation, and no-self-review doctrine
```

Another example:

```text
Task: Add web room status panel
- Superpowers: require task plan and acceptance criteria before edits
- antfu: apply frontend/tooling/DX conventions
- Matt Pocock: enforce strict typed state and API contracts
- Octowiz: record room status, validation results, and PR delivery workflow
```

The audit must also define conflict rules. For example, if a frontend convention suggests a shortcut but Octowiz sandbox policy or validation doctrine forbids it, Octowiz policy wins. If Matt Pocock TypeScript rules and antfu DX rules overlap, use the stricter rule unless it harms product simplicity or human instruction.

This audit is a required milestone before autonomous skill composition is enabled.

### 20.5 Skill Runtime Responsibilities

Add a dedicated package:

```text
packages/skill-runtime/
```

The skill runtime is responsible for:

- reading configured marketplaces
- caching marketplace metadata
- enforcing the skill allowlist
- loading skill metadata and trigger descriptions
- selecting skills based on task, repo, stack, role, and workflow step
- composing multiple skills for one task
- resolving conflicts between skills
- attaching skill decisions to the room ledger
- exposing selected skill context to OpenCode and agents
- supporting rebuilt Octowiz-native skills
- keeping skills optimized for the OpenCode-first Octowiz-v2 runtime, local Qwen agents, and ÆLLI escalation

The skill runtime should treat marketplace skills as external source material and Octowiz-native skills as normalized, tested operational doctrine.

### 20.6 Skill Library Layout

Octowiz-v2 should include a local skill library and marketplace cache:

```text
skills/
├── marketplace/
│   ├── my-org.marketplace.json
│   └── lock.json
│
├── upstream/
│   ├── superpowers/
│   ├── mattpocock/
│   ├── antfu/
│   └── octowiz/
│
├── octowiz/
│   ├── planning/
│   ├── implementation/
│   ├── adversarial-review/
│   ├── validation/
│   ├── typescript-quality/
│   ├── frontend-tooling/
│   ├── sandbox-operations/
│   ├── github-delivery/
│   ├── skill-composition/
│   └── aelli-escalation/
│
└── registry.json
```

The `marketplace/` directory stores the external marketplace index and lock metadata. The `upstream/` directory stores imported source material from the four approved skill families. The `octowiz/` directory stores rebuilt Octowiz-native skills. The `registry.json` file maps skills to triggers, roles, stacks, priorities, and source lineage.

### 20.7 Skill Registry Example

Initial `skills/registry.json` should follow this shape:

```json
{
  "marketplaces": {
    "my-org": {
      "source": "url",
      "url": "https://llm.integrahub.de/claude-code/marketplace.json",
      "enabled": true
    }
  },
  "allowlist": [
    "superpowers:*",
    "mattpocock:*",
    "antfu:*",
    "octowiz:*"
  ],
  "deny_by_default": true,
  "policy": {
    "unlisted_marketplace_skills": "deny",
    "unverified_github_repos": "deny",
    "host_privilege_requests": "require_sandbox_policy_approval"
  }
}
```

### 20.8 Skill Triggering Model

Skills should be triggered through metadata and context, not by manually asking agents to remember everything.

Trigger inputs:

- task type
- repository language and framework
- current agent role
- active workflow step
- file paths being edited
- validation failures
- review findings
- room policy
- human steering commands
- sandbox permission level

Example:

```json
{
  "task": "Implement GitHub adapter with typed PR summary output",
  "repo_stack": ["typescript", "node", "github"],
  "room_mode": "implementation",
  "agent_role": "implementation",
  "selected_skills": [
    "superpowers:planning-discipline",
    "mattpocock:typescript-quality",
    "octowiz:github-delivery",
    "octowiz:room-ledger"
  ]
}
```

### 20.9 Skill Composition Rules

Octowiz must support skill composition because a real task rarely needs only one skill.

Example composition:

```text
Superpowers process discipline
+ Matt Pocock TypeScript quality
+ Octowiz GitHub workflow
+ Octowiz validation
+ Octowiz room-ledger
```

Another example:

```text
Superpowers planning
+ antfu tooling doctrine
+ Matt Pocock TypeScript quality
+ Octowiz sandbox operations
```

Conflict resolution priority:

```text
1. Safety and sandbox policy
2. Human instruction
3. Octowiz project doctrine
4. Superpowers process discipline
5. Matt Pocock TypeScript quality
6. antfu tooling/frontend doctrine
7. Agent default behavior
```

A skill may strengthen quality requirements, but it must not bypass sandbox policy, human instructions, no-self-review rules, or validation requirements.

### 20.10 Building Octowiz-Native Skills

Octowiz-v2 should build Octowiz-native skills from the product requirements and capability audit, not by blindly importing older Octowiz v1 material.

Build steps:

```text
1. Complete the Octowiz capability audit.
2. Identify which capabilities are not covered by Superpowers, Matt Pocock, or antfu.
3. Define Octowiz-native skills for room orchestration, sandbox operations, validation, GitHub delivery, room ledger updates, and ÆLLI escalation.
4. Keep each Octowiz-native skill small, triggerable, and testable.
5. Add explicit metadata triggers for role, stack, room mode, and workflow step.
6. Test each skill against representative Octowiz tasks.
7. Record skill usage and source lineage in the room ledger.
```

Older Octowiz v1 material is not an approved active upstream for the initial implementation. It may only be used later as research material if Janis explicitly approves it. The initial Octowiz skill layer should be rebuilt cleanly around the v2 architecture.

### 20.11 Skill Usage in the Room Ledger

Every room should record which skills were active and where they came from.

Example:

```json
{
  "room_id": "room_042",
  "task_id": "task_042",
  "active_skills": [
    "superpowers:planning-discipline",
    "mattpocock:typescript-quality",
    "octowiz:adversarial-review",
    "octowiz:validation"
  ],
  "skill_sources": {
    "superpowers:planning-discipline": "my-org marketplace",
    "mattpocock:typescript-quality": "my-org marketplace",
    "octowiz:validation": "octowiz-native"
  },
  "skill_decisions": [
    {
      "skill": "mattpocock:typescript-quality",
      "reason": "TypeScript adapter implementation detected",
      "applied_to": ["packages/github-adapter/src/create-pr.ts"]
    }
  ]
}
```

This makes the system auditable. If an agent makes a decision because a skill instructed it to, the room ledger should show that.

### 20.12 MVP Skill Scope

The MVP should not import every possible marketplace skill.

Initial MVP skill scope:

```text
1. Configure the `my-org` marketplace.
2. Fetch and cache marketplace metadata.
3. Enforce allowlist-only skill discovery.
4. Complete `docs/skill-capability-audit.md`.
5. Complete `docs/skill-composition-strategy.md`.
6. Import or rebuild Superpowers workflow discipline skills.
7. Import or rebuild Matt Pocock TypeScript quality skills.
8. Import or rebuild antfu tooling/frontend skills.
9. Build Octowiz-native skills from the capability audit and v2 product doctrine.
10. Implement a minimal skill registry and trigger matcher.
11. Record active skills and source lineage in the room ledger.
```

No additional skill families should be added until these four are working together reliably.

---

## 21. Suggested Repository Structure

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
│   ├── skills.md
│   ├── skill-sources.md
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
│   ├── skill-runtime/
│   ├── arena-runtime/
│   ├── sandbox-runtime/
│   ├── doctrine/
│   ├── room-ledger/
│   └── validation/
│
├── skills/
│   ├── upstream/
│   │   ├── superpowers/
│   │   ├── mattpocock/
│   │   ├── antfu/
│   │   └── octowiz/
│   ├── octowiz/
│   │   ├── planning/
│   │   ├── implementation/
│   │   ├── adversarial-review/
│   │   ├── validation/
│   │   ├── typescript-quality/
│   │   ├── frontend-tooling/
│   │   ├── sandbox-operations/
│   │   ├── github-delivery/
│   │   └── aelli-escalation/
│   └── registry.json
│
├── examples/
│   ├── room-ledger.example.json
│   ├── arena-task.example.json
│   └── task.example.md
│
└── scripts/
    ├── create-room.sh
    ├── start-opencode.sh
    └── run-validation.sh
```

---

## 22. Package Responsibilities

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

### `skill-runtime`

Responsible for:

- discovering and loading available skills
- importing external skill packs such as Superpowers, Matt Pocock-style TypeScript skills, antfu-style tooling skills, and Octowiz-native skills
- rebuilding approved external skill patterns into Octowiz-native operational doctrine
- selecting skills based on task type, repo stack, agent role, workflow step, file paths, validation failures, and room policy
- composing multiple skills for a single task
- resolving conflicts according to Octowiz doctrine and sandbox policy
- exposing selected skill instructions to OpenCode, agents, and AELLI escalation
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

## 23. Technical Direction

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

## 24. Possible First Milestones

### Milestone 1: Repo Foundation

- Create `octowiz-v2`
- Add README
- Add concept documentation
- Add initial architecture docs
- Define room ledger schema
- Define doctrine rules
- Add skill source inventory for Superpowers, Matt Pocock-style skills, antfu-style skills, and Octowiz-native skills
- Add initial `skills/registry.json`
- Document that Octowiz-v2 is OpenCode-first and not Claude Code compatible
- Document human collaboration roles for Janis, Bo, and Dennis

### Milestone 2: Skill Capability Audit and Composition Design

- Audit what Octowiz must be able to do across rooms, agents, sandboxing, validation, GitHub delivery, and ÆLLI escalation
- Create `docs/skill-capability-audit.md`
- Create `docs/skill-composition-strategy.md`
- Map required capabilities to the four approved skill families: Superpowers, Matt Pocock, antfu, and Octowiz
- Define which skill family triggers for each workflow step, agent role, file type, and tech-stack area
- Define conflict-resolution rules between process discipline, TypeScript quality, frontend/tooling doctrine, and Octowiz product doctrine
- Define which capabilities remain human-gated or ÆLLI-escalated
- Define when Diagnosis Gate blocks autonomous fixes
- Define early steering checkpoints before agent execution
- Produce the first `skills/registry.json` based on the audit

### Milestone 3: Sandbox Runtime Foundation

- Add `packages/sandbox-runtime`
- Define `SandboxProvider` interface
- Add rootless Docker/Podman provider for MVP
- Define MicroVM-per-Room as target backend
- Add sandbox policy defaults
- Deny host Docker socket by default
- Deny privileged mode by default
- Add artifact/log collection concept

### Milestone 4: Manual Room Creation

- Add script to create Zellij session
- Add script to start OpenCode in session
- Add simple room ledger file
- Add manual task file format

### Milestone 5: Agent Role Prototype

- Add implementation agent runner
- Add review agent runner
- Add validation runner
- Enforce no self-review in metadata

### Milestone 6: GitHub Flow

- Create branch from task
- Commit changes
- Generate PR body
- Attach validation summary
- Attach review summary

### Milestone 7: ÆLLI Escalation

- Add manual escalation command
- Send room/task context to ÆLLI
- Store recommendation in room ledger
- Allow recommendation to influence next action

### Milestone 8: Multiplayer Web Entry

- Provide browser-accessible room/session entry
- Support joining an active room
- Show room status
- Show linked task/branch/PR

---

## 25. Example Task Flow

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
5. Planner agent performs read-only inspection.
6. Planner agent creates implementation plan.
7. Human steering checkpoint confirms direction.
8. Implementation agent writes session manager.
9. Validation agent runs tests.
10. Review agent critiques code.
11. Implementation agent fixes issues only within approved scope.
12. Review agent confirms.
13. Octowiz prepares GitHub PR.
14. Human approves final merge.
```

---

## 26. Product Differentiation

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

## 27. Long-Term Vision

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

## 28. North Star

The north star for Octowiz:

> Octowiz is the coding tentacle of ÆLLI — a multiplayer AI engineering system where humans and agents collaborate in shared coding rooms, with structured implementation, adversarial review, validation loops, GitHub delivery, and escalation to higher-level intelligence when needed.

Everything in the repository should serve that direction.

If a feature does not improve multiplayer engineering, code quality, agent coordination, review discipline, or delivery clarity, it probably does not belong in the MVP.
