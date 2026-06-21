<script setup lang="ts">
// RoomShell — the product shell layout for a single room.
//
// Pure layout chrome: a header strip, a sidebar nav region, and a main status region that
// hosts dashboard panels. It owns no data; surfaces fill its named slots:
//   - #brand    : the product/room title area (top-left of the header)
//   - #header   : header-right region (room identity + status badge in M10a)
//   - #sidebar  : left navigation column
//   - default   : the main status region where dashboard panels stack
//
// Composed above base + ui, so it references the shared design tokens only.
</script>

<template>
  <div class="shell">
    <header class="shell__header">
      <div class="shell__brand">
        <slot name="brand">
          Octowiz
        </slot>
      </div>
      <div class="shell__header-status">
        <slot name="header" />
      </div>
    </header>
    <div class="shell__body">
      <aside class="shell__sidebar" aria-label="Room navigation">
        <slot name="sidebar" />
      </aside>
      <main class="shell__main">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ow-space-3);
  padding: var(--ow-space-3) var(--ow-space-4);
  border-bottom: 1px solid var(--ow-color-border);
  background: var(--ow-color-surface);
}

.shell__brand {
  font-weight: 700;
}

.shell__header-status {
  display: flex;
  align-items: center;
  gap: var(--ow-space-3);
  flex-wrap: wrap;
}

.shell__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.shell__sidebar {
  flex: 0 0 14rem;
  padding: var(--ow-space-4);
  border-right: 1px solid var(--ow-color-border);
}

.shell__main {
  flex: 1;
  min-width: 0;
  padding: var(--ow-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-4);
}

@media (max-width: 48rem) {
  .shell__body {
    flex-direction: column;
  }

  .shell__sidebar {
    flex-basis: auto;
    border-right: none;
    border-bottom: 1px solid var(--ow-color-border);
  }
}
</style>
