<script setup lang="ts">
import type { CheckStatus, Validation } from '@octowiz/schemas'

// Validation panel — each validation's overall status plus its individual checks. Read-only
// projection of RoomState.validations. Pure presentation: the parent fetches, this renders.
// Status accents are driven off per-status CSS vars (--ow-color-check-*), mirroring the way
// TaskStatusBadge accents off the task-status tokens.
defineProps<{ validations: Validation[] }>()

const CHECK_LABELS: Record<CheckStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
}
</script>

<template>
  <section class="panel" aria-labelledby="validations-heading">
    <h2 id="validations-heading" class="panel__title">
      Validation
    </h2>
    <p v-if="validations.length === 0" class="panel__empty">
      No validations have run for this room yet.
    </p>
    <ul v-else class="validations">
      <li v-for="validation in validations" :key="validation.id" class="validation">
        <div class="validation__head">
          <span class="validation__task">Task <code>{{ validation.taskId }}</code></span>
          <span
            class="check-status"
            :data-status="validation.status"
            :style="{ '--accent': `var(--ow-color-check-${validation.status})` }"
          >
            <span class="check-status__dot" aria-hidden="true" />
            {{ CHECK_LABELS[validation.status] }}
          </span>
        </div>
        <ul v-if="validation.checks.length" class="checks">
          <li v-for="(check, index) in validation.checks" :key="`${index}-${check.name}`" class="check">
            <div class="check__main">
              <span class="check__name">{{ check.name }}</span>
              <p v-if="check.output" class="check__output">
                {{ check.output }}
              </p>
            </div>
            <span
              class="check-status"
              :data-status="check.status"
              :style="{ '--accent': `var(--ow-color-check-${check.status})` }"
            >
              <span class="check-status__dot" aria-hidden="true" />
              {{ CHECK_LABELS[check.status] }}
            </span>
          </li>
        </ul>
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

.validations {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-3);
}

.validation__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ow-space-3);
  flex-wrap: wrap;
}

.validation__task {
  font-weight: 600;
}

.checks {
  list-style: none;
  margin: var(--ow-space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-2);
}

.check {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ow-space-3);
}

.check__main {
  min-width: 0;
}

.check__output {
  margin: var(--ow-space-1) 0 0;
  color: var(--ow-color-text-muted);
  font-size: 0.875rem;
}

.check-status {
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
  white-space: nowrap;
}

.check-status__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--ow-radius-pill);
  background: var(--accent);
}
</style>
