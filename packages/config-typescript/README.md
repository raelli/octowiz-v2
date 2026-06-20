# @octowiz/config-typescript

Shared TypeScript config presets. Extend one from a package `tsconfig.json`:

- `@octowiz/config-typescript/base` — any TS package
- `@octowiz/config-typescript/node` — Node/library packages
- `@octowiz/config-typescript/vue-nuxt` — Nuxt/Vue layers (not used yet)

All presets extend the repo-root `tsconfig.base.json`, which holds shared strictness.
