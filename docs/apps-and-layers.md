# Apps and Nuxt Layers

## Apps

### `apps/octowiz-web`

Nuxt web app for:

- room dashboard
- session entry
- Zellij/OpenCode join instructions
- task status
- validation status
- GitHub PR status
- ÆLLI escalation visibility

This app should contain minimal business logic. It composes layers and calls packages/API endpoints.

### `apps/octowiz-api`

API service for:

- room creation
- room ledger updates
- task assignment
- validation triggers
- GitHub flow triggers
- ÆLLI escalation triggers

The API may use Nitro where useful, but core logic must stay in `packages/*`.

### `apps/octowiz-worker`

Worker service for:

- agent execution
- validation loops
- review jobs
- sandbox lifecycle
- Zellij process orchestration
- OpenCode process orchestration

### `apps/aelli-control-plane`

Optional app surface for ÆLLI integration.

For MVP, this can begin as a thin placeholder or API-facing adapter surface. ÆLLI should not be collapsed into Octowiz. Octowiz calls ÆLLI; it does not become ÆLLI.

## Nuxt Layers

### `layers/base`

Global Nuxt defaults:

- shared Nuxt config
- app head defaults
- runtime config typing
- accessibility defaults
- common composables
- performance defaults

### `layers/ui`

Shared UI system:

- Nuxt UI setup
- design token integration
- reusable components
- layout primitives
- theme wrappers

### `layers/octowiz-shell`

Product shell:

- navigation
- sidebar
- room shell layout
- command palette
- status regions
- authenticated shell later

### `layers/room-dashboard`

Room-specific surfaces:

- active room status
- participants
- branch and repo status
- task state
- validation state
- review state
- escalation state
- ledger timeline

### `layers/aelli-console`

ÆLLI-specific surfaces:

- escalation panel
- advisory summaries
- architecture recommendations
- risk and ambiguity reports
- cross-room intelligence later

### `layers/docs`

Documentation and internal manual layer:

- markdown-driven docs
- architecture pages
- doctrine pages
- workflow docs
- later possible JSON/Markdown renderer integration
