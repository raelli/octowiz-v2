<script setup lang="ts">
import type { Review, ReviewVerdict } from '@octowiz/schemas'

// Review panel — reviewer decisions per task. Read-only projection of RoomState.reviews.
// Pure presentation: the parent fetches, this renders. Verdict labels are required;
// the verdict's raw value rides on data-verdict for styling/testing hooks.
defineProps<{ reviews: Review[] }>()

const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
}
</script>

<template>
  <section class="panel" aria-labelledby="reviews-heading">
    <h2 id="reviews-heading" class="panel__title">
      Review
    </h2>
    <p v-if="reviews.length === 0" class="panel__empty">
      No reviews have been recorded for this room yet.
    </p>
    <ul v-else class="reviews">
      <li v-for="review in reviews" :key="review.id" class="review">
        <div class="review__head">
          <div class="review__main">
            <span class="review__task">Task <code>{{ review.taskId }}</code></span>
            <span class="review__reviewer">by {{ review.reviewerId }}</span>
          </div>
          <span class="verdict" :data-verdict="review.verdict">
            {{ VERDICT_LABELS[review.verdict] }}
          </span>
        </div>
        <p v-if="review.notes" class="review__notes">
          {{ review.notes }}
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

.reviews {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-3);
}

.review__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ow-space-3);
  flex-wrap: wrap;
}

.review__main {
  display: flex;
  align-items: baseline;
  gap: var(--ow-space-2);
  flex-wrap: wrap;
}

.review__task {
  font-weight: 600;
}

.review__reviewer {
  color: var(--ow-color-text-muted);
  font-size: 0.875rem;
}

.review__notes {
  margin: var(--ow-space-2) 0 0;
  color: var(--ow-color-text-muted);
  font-size: 0.875rem;
}

.verdict {
  padding: var(--ow-space-1) var(--ow-space-3);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-pill);
  background: var(--ow-color-surface);
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}
</style>
