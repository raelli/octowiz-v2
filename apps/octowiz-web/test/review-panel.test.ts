import type { Review } from '@octowiz/schemas'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReviewPanel from '../../../layers/room-dashboard/app/components/ReviewPanel.vue'

// The render path under test is RoomState.reviews -> rows (task, reviewer, verdict label,
// optional notes). Pure presentation, so the test owns its fixtures. Mirrors the isolated
// direct-import mounts of the M10b panels.
function review(over: Partial<Review> = {}): Review {
  return { id: 'r1', taskId: 't1', reviewerId: 'octo', verdict: 'approved', createdAt: '2026-06-21T00:00:00Z', ...over }
}

describe('reviewPanel', () => {
  it('renders each review with task, reviewer, verdict and notes when present', () => {
    const reviews: Review[] = [
      review({ id: 'r1', taskId: 't1', reviewerId: 'ada', verdict: 'approved' }),
      review({ id: 'r2', taskId: 't2', reviewerId: 'octo', verdict: 'changes_requested', notes: 'Add a test' }),
      review({ id: 'r3', taskId: 't3', reviewerId: 'ned', verdict: 'rejected' }),
    ]
    const wrapper = mount(ReviewPanel, { props: { reviews } })
    const text = wrapper.text()

    expect(text).toContain('t1')
    expect(text).toContain('ada')
    expect(text).toContain('octo')
    // Human-readable verdict labels.
    expect(text).toContain('Approved')
    expect(text).toContain('Changes requested')
    expect(text).toContain('Rejected')
    // Optional notes render when present.
    expect(text).toContain('Add a test')

    // One row per review; verdict pill carries the raw verdict value.
    expect(wrapper.findAll('.review')).toHaveLength(3)
    const verdicts = wrapper.findAll('.verdict').map(v => v.attributes('data-verdict'))
    expect(verdicts).toEqual(['approved', 'changes_requested', 'rejected'])
  })

  it('shows an empty state when the room has no reviews', () => {
    const wrapper = mount(ReviewPanel, { props: { reviews: [] } })
    expect(wrapper.findAll('.review')).toHaveLength(0)
    expect(wrapper.text()).toContain('No reviews have been recorded for this room yet.')
  })
})
