import { fileURLToPath } from 'node:url'
// Explicit import so the layer type-checks under plain `tsc` without Nuxt's generated
// auto-import types.
import { defineNuxtConfig } from 'nuxt/config'

// layers/ui — the shared UI system: design tokens + reusable components.
//
// For the M10a slice this is hand-rolled (CSS custom properties + a StatusBadge). A
// component framework (e.g. Nuxt UI) is a later slice; keeping it dependency-free here
// avoids dragging a CSS toolchain into the thin vertical.
export default defineNuxtConfig({
  // Design tokens, loaded globally so every app/layer can use the CSS variables. Resolve
  // the path relative to this file so it works however an app composes the layer.
  css: [fileURLToPath(new URL('./app/assets/css/tokens.css', import.meta.url))],
})
