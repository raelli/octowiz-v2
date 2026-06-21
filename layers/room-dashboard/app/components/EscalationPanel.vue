<script setup lang="ts">
import type { Escalation } from '@octowiz/schemas'

// Escalation panel — ÆLLI escalation reasons and any recommendations. Read-only projection
// of RoomState.escalations. Pure presentation: the parent fetches, this renders. taskId and
// recommendation are optional and only render when present.
defineProps<{ escalations: Escalation[] }>()
</script>

<template>
  <section class="panel" aria-labelledby="escalations-heading">
    <h2 id="escalations-heading" class="panel__title">
      Escalation
    </h2>
    <p v-if="escalations.length === 0" class="panel__empty">
      No escalations have been raised for this room yet.
    </p>
    <ul v-else class="escalations">
      <li v-for="escalation in escalations" :key="escalation.id" class="escalation">
        <p class="escalation__reason">
          {{ escalation.reason }}
        </p>
        <p v-if="escalation.taskId" class="escalation__task">
          Task <code>{{ escalation.taskId }}</code>
        </p>
        <p v-if="escalation.recommendation" class="escalation__recommendation">
          <span class="escalation__label">Recommendation:</span> {{ escalation.recommendation }}
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius);
  background: var(--ow-color-surface);
  padding: var(--ow-space-4);
}

.panel__title {
  margin: 0 0 var(--ow-space-3);
  font-size: 1.125rem;
}

.panel__empty {
  margin: 0;
  color: var(--ow-color-text-muted);
}

.escalations {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-3);
}

.escalation {
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-1);
}

.escalation__reason {
  margin: 0;
  font-weight: 600;
}

.escalation__task {
  margin: 0;
  color: var(--ow-color-text-muted);
  font-size: 0.875rem;
}

.escalation__recommendation {
  margin: 0;
  color: var(--ow-color-text-muted);
  font-size: 0.875rem;
}

.escalation__label {
  font-weight: 600;
  color: var(--ow-color-text);
}
</style>
