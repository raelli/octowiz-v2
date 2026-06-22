# octowiz-v2
Octowiz-v2 is the OpenCode-first, Zellij-powered multiplayer AI engineering workspace.
## Start here
- Onboarding guide: [`docs/onboarding.html`](docs/onboarding.html)
- Project index: [`PROJECT_PLAN.md`](PROJECT_PLAN.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
## Quick bootstrap
```bash
pnpm install
podman machine start
gh auth status || gh auth login
```
## First CLI run
```bash
pnpm --filter @octowiz/cli octowiz create-room --name "Demo Room"
```
