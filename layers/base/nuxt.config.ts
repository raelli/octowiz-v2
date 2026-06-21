// Import the config helper explicitly so the layer type-checks under plain `tsc`, without
// relying on Nuxt's generated auto-import types (those only exist after `nuxt prepare`).
import { defineNuxtConfig } from 'nuxt/config'

// layers/base — global Nuxt defaults composed by every app.
//
// Holds runtime/accessibility/performance defaults so apps and downstream layers don't
// each redeclare them. Kept deliberately small for the M10a slice; later slices extend it.
export default defineNuxtConfig({
  // SSR on: the room read happens server-side (the ledger uses node:fs), and the page is
  // rendered from that data — no client-side fs, no hydration of server-only modules.
  ssr: true,

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      // A sensible default title + viewport for every page across the app. Pages set their
      // own title via useHead; this is the fallback.
      title: 'Octowiz',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },

  // Typed runtime config. Apps override `ledgerDir`/`roomId` via NUXT_* env vars.
  runtimeConfig: {
    // Server-only: where the file-backed room ledger lives, relative to cwd.
    ledgerDir: '.octowiz/ledger',
    public: {},
  },
})
