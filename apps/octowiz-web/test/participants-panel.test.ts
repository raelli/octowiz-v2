import type { Participant } from '@octowiz/schemas'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ParticipantsPanel from '../../../layers/room-dashboard/app/components/ParticipantsPanel.vue'

// The render path under test is RoomState.participants -> rows (name, kind, roles). The
// panel is pure presentation, so the test owns its fixtures rather than touching any real
// ledger files. Mirrors the isolated direct-import mount used for StatusBadge.
function participant(over: Partial<Participant> = {}): Participant {
  return { id: 'p1', kind: 'human', roles: ['implementer'], displayName: 'Ada', ...over }
}

describe('participantsPanel', () => {
  it('renders each participant with name, kind and roles', () => {
    const participants: Participant[] = [
      participant({ id: 'p1', displayName: 'Ada', kind: 'human', roles: ['implementer', 'reviewer'] }),
      participant({ id: 'p2', displayName: 'Octo', kind: 'agent', roles: ['validator'] }),
    ]
    const wrapper = mount(ParticipantsPanel, { props: { participants } })
    const text = wrapper.text()

    expect(text).toContain('Ada')
    expect(text).toContain('Octo')
    expect(text).toContain('implementer')
    expect(text).toContain('reviewer')
    expect(text).toContain('validator')
    // One row per participant.
    expect(wrapper.findAll('.participant')).toHaveLength(2)
  })

  it('shows an empty state when no one has joined', () => {
    const wrapper = mount(ParticipantsPanel, { props: { participants: [] } })
    expect(wrapper.findAll('.participant')).toHaveLength(0)
    expect(wrapper.text()).toContain('No one has joined this room yet.')
  })
})
