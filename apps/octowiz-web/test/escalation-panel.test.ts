import type { Escalation } from '@octowiz/schemas'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EscalationPanel from '../../../layers/room-dashboard/app/components/EscalationPanel.vue'

// The render path under test is RoomState.escalations -> rows (reason + optional taskId +
// optional recommendation). Pure presentation, so the test owns its fixtures. Mirrors the
// isolated direct-import mounts of the M10b panels.
function escalation(over: Partial<Escalation> = {}): Escalation {
  return { id: 'e1', roomId: 'demo-room', reason: 'Reason', createdAt: '2026-06-21T00:00:00Z', ...over }
}

describe('escalationPanel', () => {
  it('renders the reason, and the recommendation/task when present', () => {
    const escalations: Escalation[] = [
      escalation({
        id: 'e1',
        taskId: 't1',
        reason: 'Reviewer and validator disagree',
        recommendation: 'Escalate to a human steward',
      }),
    ]
    const wrapper = mount(EscalationPanel, { props: { escalations } })
    const text = wrapper.text()

    expect(text).toContain('Reviewer and validator disagree')
    expect(text).toContain('t1')
    expect(text).toContain('Escalate to a human steward')
    expect(wrapper.findAll('.escalation')).toHaveLength(1)
    expect(wrapper.find('.escalation__recommendation').exists()).toBe(true)
  })

  it('omits the recommendation when it is absent', () => {
    const escalations: Escalation[] = [
      escalation({ id: 'e2', reason: 'Budget exhausted', recommendation: undefined }),
    ]
    const wrapper = mount(EscalationPanel, { props: { escalations } })

    expect(wrapper.text()).toContain('Budget exhausted')
    // The recommendation block must not render when there is no recommendation.
    expect(wrapper.find('.escalation__recommendation').exists()).toBe(false)
  })

  it('shows an empty state when the room has no escalations', () => {
    const wrapper = mount(EscalationPanel, { props: { escalations: [] } })
    expect(wrapper.findAll('.escalation')).toHaveLength(0)
    expect(wrapper.text()).toContain('No escalations have been raised for this room yet.')
  })
})
