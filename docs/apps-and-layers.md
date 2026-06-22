# Apps and Nuxt Layers
This document describes apps and Nuxt layers that are currently present in the repository.
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
No additional apps are currently present under `apps/`.
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
No additional layers are currently present under `layers/`.
