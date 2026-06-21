import type { RoomState } from '@octowiz/schemas'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatusBadge from '../../../layers/ui/app/components/StatusBadge.vue'

// A representative RoomState projection — the same shape the server route returns from
// RoomLedger.getState. The render path under test is status -> badge, so the test owns a
// fixture rather than depending on any real `.octowiz/ledger` files on disk.
function roomState(status: RoomState['room']['status']): RoomState {
  return {
    room: { id: 'demo-room', name: 'Demo Room', status, createdAt: '2025-01-01T00:00:00.000Z' },
    participants: [],
    tasks: [],
    reviews: [],
    validations: [],
    escalations: [],
    sessions: [],
    sandboxes: [],
  }
}

describe('statusBadge', () => {
  it('renders the active room status', () => {
    const wrapper = mount(StatusBadge, { props: { status: roomState('active').room.status } })
    expect(wrapper.text()).toBe('Active')
    expect(wrapper.attributes('data-status')).toBe('active')
  })

  it('renders the archived room status', () => {
    const wrapper = mount(StatusBadge, { props: { status: roomState('archived').room.status } })
    expect(wrapper.text()).toBe('Archived')
    expect(wrapper.attributes('data-status')).toBe('archived')
  })
})
