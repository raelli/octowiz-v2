// Explicit import so the layer type-checks under plain `tsc` without Nuxt's generated
// auto-import types.
import { defineNuxtConfig } from 'nuxt/config'

// layers/octowiz-shell — the product shell.
//
// Provides the room shell layout (header/sidebar/status regions) that hosts the dashboard
// panels. Holds no domain logic itself: it is pure layout chrome, composed above base + ui
// so it can reference the shared design tokens. Downstream surfaces (room-dashboard) drop
// their panels into the regions this layout exposes via slots.
export default defineNuxtConfig({})
