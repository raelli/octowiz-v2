// apps/octowiz-web — composes the base + ui layers and renders one room's status.
//
// The app holds minimal logic: it extends the foundational layers, exposes the target
// room id via runtime config, and lets the page + server route do the read.
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  // Compose the foundational layers. `base` brings global Nuxt/runtime/a11y defaults;
  // `ui` brings the design tokens + shared components (StatusBadge).
  extends: ['../../layers/base', '../../layers/ui'],

  runtimeConfig: {
    // `ledgerDir` is private (server-only) and inherited from layers/base; override with
    // NUXT_LEDGER_DIR.
    public: {
      // Which room to show. Public so the page can read it on both server and client
      // (private runtimeConfig keys are server-only). Override with NUXT_PUBLIC_ROOM_ID.
      roomId: 'demo-room',
    },
  },

  devtools: { enabled: false },
})
