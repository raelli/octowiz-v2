<script setup lang="ts">
import type { RoomStatus } from '@octowiz/schemas'
import { computed } from 'vue'

// A pill badge reflecting a room's status. Pure presentation: it maps the status enum to
// a label + accent colour and nothing else, so it is trivially unit-testable.
const props = defineProps<{ status: RoomStatus }>()

const LABELS: Record<RoomStatus, string> = {
  active: 'Active',
  archived: 'Archived',
}

const label = computed(() => LABELS[props.status])
// Drive the accent off a per-status CSS var defined in the design tokens.
const accent = computed(() => `var(--ow-color-${props.status})`)
</script>

<template>
  <span class="status-badge" :data-status="status" :style="{ '--accent': accent }">
    <span class="status-badge__dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ow-space-2);
  padding: var(--ow-space-1) var(--ow-space-3);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-pill);
  background: var(--ow-color-surface);
  color: var(--ow-color-text);
  font-size: 0.875rem;
  font-weight: 600;
}

.status-badge__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--ow-radius-pill);
  background: var(--accent);
}
</style>
