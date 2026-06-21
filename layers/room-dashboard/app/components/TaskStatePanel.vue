<script setup lang="ts">
import type { Task } from '@octowiz/schemas'
// Explicit relative import (rather than relying on Nuxt auto-import) so the component
// resolves both when Nuxt composes the layer AND in isolated @vue/test-utils unit mounts,
// where auto-imports are not registered.
import TaskStatusBadge from './TaskStatusBadge.vue'

// Task-state panel — the room's tasks with each task's current status. Read-only projection
// of RoomState.tasks. Pure presentation: the parent fetches, this renders.
defineProps<{ tasks: Task[] }>()
</script>

<template>
  <section class="panel" aria-labelledby="tasks-heading">
    <h2 id="tasks-heading" class="panel__title">
      Task state
    </h2>
    <p v-if="tasks.length === 0" class="panel__empty">
      This room has no tasks yet.
    </p>
    <ul v-else class="tasks">
      <li v-for="task in tasks" :key="task.id" class="task">
        <div class="task__main">
          <span class="task__title">{{ task.title }}</span>
          <p v-if="task.description" class="task__description">
            {{ task.description }}
          </p>
        </div>
        <TaskStatusBadge :status="task.status" />
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

.tasks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-3);
}

.task {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ow-space-3);
}

.task__main {
  min-width: 0;
}

.task__title {
  font-weight: 600;
}

.task__description {
  margin: var(--ow-space-1) 0 0;
  color: var(--ow-color-text-muted);
  font-size: 0.875rem;
}
</style>
