<script setup lang="ts">
import type { Participant } from '@octowiz/schemas'

// Participants panel — who has joined the room and their roles. Read-only projection of
// RoomState.participants. Pure presentation: the parent fetches, this renders.
defineProps<{ participants: Participant[] }>()
</script>

<template>
  <section class="panel" aria-labelledby="participants-heading">
    <h2 id="participants-heading" class="panel__title">
      Participants
    </h2>
    <p v-if="participants.length === 0" class="panel__empty">
      No one has joined this room yet.
    </p>
    <ul v-else class="participants">
      <li v-for="p in participants" :key="p.id" class="participant">
        <div class="participant__identity">
          <span class="participant__name">{{ p.displayName }}</span>
          <span class="participant__kind" :data-kind="p.kind">{{ p.kind }}</span>
        </div>
        <ul v-if="p.roles.length" class="roles">
          <li v-for="role in p.roles" :key="role" class="role">
            {{ role }}
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

.participants {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-3);
}

.participant {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ow-space-3);
  flex-wrap: wrap;
}

.participant__identity {
  display: flex;
  align-items: center;
  gap: var(--ow-space-2);
}

.participant__name {
  font-weight: 600;
}

.participant__kind {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ow-color-text-muted);
}

.roles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: var(--ow-space-2);
  flex-wrap: wrap;
}

.role {
  padding: var(--ow-space-1) var(--ow-space-2);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-pill);
  font-size: 0.75rem;
  color: var(--ow-color-text-muted);
}
</style>
