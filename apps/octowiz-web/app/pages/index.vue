<script setup lang="ts">
import type { RoomState } from '@octowiz/schemas'

// The thin vertical slice: read one real room's status from the ledger projection (via the
// server route) and render its identity + status badge. Read-only, single fetch on load.
const { roomId } = useRuntimeConfig().public

const { data: state, error } = await useFetch<RoomState>(`/api/rooms/${roomId}`)

useHead({ title: () => state.value?.room.name ?? 'Room not found' })
</script>

<template>
  <main class="page">
    <template v-if="state">
      <header class="room">
        <h1 class="room__name">
          {{ state.room.name }}
        </h1>
        <StatusBadge :status="state.room.status" />
      </header>
      <p class="room__id">
        Room ID: <code>{{ state.room.id }}</code>
      </p>
    </template>
    <p v-else class="error">
      Could not load room <code>{{ roomId }}</code>{{ error ? `: ${error.statusMessage}` : '' }}.
    </p>
  </main>
</template>

<style scoped>
.page {
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--ow-space-4);
}

.room {
  display: flex;
  align-items: center;
  gap: var(--ow-space-3);
  flex-wrap: wrap;
}

.room__name {
  margin: 0;
  font-size: 1.75rem;
}

.room__id {
  color: var(--ow-color-text-muted);
}

.error {
  color: var(--ow-color-text-muted);
}
</style>
