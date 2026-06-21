// Explicit import so the layer type-checks under plain `tsc` without Nuxt's generated
// auto-import types.
import { defineNuxtConfig } from 'nuxt/config'

// layers/room-dashboard — room-specific surfaces.
//
// The first room panels (participants + task state) that read from the read-only RoomState
// projection. Composed above base + ui + octowiz-shell so its panels drop into the shell's
// status regions and reuse the shared design tokens. Read-only: no mutation paths here.
export default defineNuxtConfig({})
