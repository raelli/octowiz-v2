<script setup lang="ts">
import type { RoomState } from '@octowiz/schemas'

// Read one real room's projection from the ledger (via the server route) and render it in
// the product shell: the M10a identity + status block, plus the M10b participants and
// task-state panels. Read-only, single fetch on load.
//
// RoomShell, StatusBadge, ParticipantsPanel and TaskStatePanel are auto-imported across the
// composed layers (ui / octowiz-shell / room-dashboard).
const { roomId } = useRuntimeConfig().public

const { data: state, error } = await useFetch<RoomState>(`/api/rooms/${roomId}`)

useHead({ title: () => state.value?.room.name ?? 'Room not found' })
</script>

<template>
  <RoomShell>
    <template #brand>
      Octowiz
    </template>

    <!-- M10a: room identity + status, preserved in the shell header. -->
    <template v-if="state" #header>
      <h1 class="room__name">
        {{ state.room.name }}
      </h1>
      <StatusBadge :status="state.room.status" />
    </template>

    <template v-if="state" #sidebar>
      <nav class="nav" aria-label="Room sections">
        <p class="nav__heading">
          Room
        </p>
        <p class="nav__id">
          ID: <code>{{ state.room.id }}</code>
        </p>
      </nav>
    </template>

    <!-- Main status region: M10a id line + the M10b panels, mounted additively. -->
    <template v-if="state">
      <p class="room__id">
        Room ID: <code>{{ state.room.id }}</code>
      </p>
      <ParticipantsPanel :participants="state.participants" />
      <TaskStatePanel :tasks="state.tasks" />
    </template>
    <p v-else class="error">
      Could not load room <code>{{ roomId }}</code>{{ error ? `: ${error.statusMessage}` : '' }}.
    </p>
  </RoomShell>
</template>

<style scoped>
.room__name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.nav__heading {
  margin: 0 0 var(--ow-space-2);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ow-color-text-muted);
}

.nav__id {
  margin: 0;
  color: var(--ow-color-text-muted);
  font-size: 0.875rem;
}

.room__id {
  margin: 0;
  color: var(--ow-color-text-muted);
}

.error {
  color: var(--ow-color-text-muted);
}
</style>
