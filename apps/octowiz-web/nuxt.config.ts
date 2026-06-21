// apps/octowiz-web — composes the foundational + product layers and renders one room's
// dashboard.
//
// The app holds minimal logic: it extends the layers, exposes the target room id via
// runtime config, and lets the page + server route do the read.
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  // Compose the layers, foundational first so product layers can build on them:
  //   base           — global Nuxt/runtime/a11y defaults
  //   ui             — design tokens + shared components (StatusBadge)
  //   octowiz-shell  — the room shell layout (RoomShell)
  //   room-dashboard — room panels (ParticipantsPanel, TaskStatePanel)
  extends: [
    '../../layers/base',
    '../../layers/ui',
    '../../layers/octowiz-shell',
    '../../layers/room-dashboard',
  ],

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
