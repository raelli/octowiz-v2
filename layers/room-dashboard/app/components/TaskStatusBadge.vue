<script setup lang="ts">
import type { TaskStatus } from '@octowiz/schemas'
import { computed } from 'vue'

// A pill badge for a task's status. TaskStatus has six values (open/in_progress/in_review/
// validated/merged/blocked), so the room-level StatusBadge (active/archived only) can't
// render it — this is a sibling that reuses the shared design *tokens* (surface, border,
// radius, spacing) rather than the StatusBadge component. Pure presentation, so trivially
// unit-testable.
const props = defineProps<{ status: TaskStatus }>()

const LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  in_review: 'In review',
  validated: 'Validated',
  merged: 'Merged',
  blocked: 'Blocked',
}

const label = computed(() => LABELS[props.status])
// Drive the accent off a per-status CSS var defined in the design tokens.
const accent = computed(() => `var(--ow-color-task-${props.status})`)
</script>

<template>
  <span class="task-status-badge" :data-status="status" :style="{ '--accent': accent }">
    <span class="task-status-badge__dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.task-status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ow-space-2);
  padding: var(--ow-space-1) var(--ow-space-3);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-pill);
  background: var(--ow-color-surface);
  color: var(--ow-color-text);
  font-size: 0.8125rem;
  font-weight: 600;
}

.task-status-badge__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--ow-radius-pill);
  background: var(--accent);
}
</style>
