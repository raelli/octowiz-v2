# Human Collaboration

## Initial Human Roles

Initial human collaboration model:

- Janis: product owner, system designer, and primary steering authority
- Bo: active Vibecoding collaborator
- Dennis: technical advisor, reviewer, and architecture sparring partner; optionally active coder when explicitly invited

Dennis' default role is technical advisor/reviewer, not default active implementer.

## Dennis' Supported Interaction Modes

Octowiz should allow Dennis to:

- review plans before execution
- review implementation proposals
- challenge architecture decisions
- inspect diffs
- request changes
- join a shared Zellij/OpenCode room
- actively code when invited into that role

## Human/Agent Operating Model

The system should make roles explicit:

```text
Human steering authority
Implementation agent
Review agent
Validation agent
ÆLLI advisor/escalation
Human merge approval
```

No actor should approve their own implementation without an independent review step.
