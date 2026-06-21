import type { Validation } from '@octowiz/schemas'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ValidationPanel from '../../../layers/room-dashboard/app/components/ValidationPanel.vue'

// The render path under test is RoomState.validations -> rows (overall status + per-check
// name/status, optional output). Pure presentation, so the test owns its fixtures rather
// than touching any real ledger. Mirrors the isolated direct-import mounts of the M10b panels.
function validation(over: Partial<Validation> = {}): Validation {
  return { id: 'v1', taskId: 't1', status: 'passed', checks: [], createdAt: '2026-06-21T00:00:00Z', ...over }
}

describe('validationPanel', () => {
  it('renders each validation with its overall status and per-check results', () => {
    const validations: Validation[] = [
      validation({
        id: 'v1',
        taskId: 't1',
        status: 'failed',
        checks: [
          { name: 'lint', status: 'passed' },
          { name: 'type-check', status: 'failed', output: 'TS2345 in index.ts' },
        ],
      }),
      validation({ id: 'v2', taskId: 't2', status: 'passed', checks: [{ name: 'test', status: 'passed' }] }),
    ]
    const wrapper = mount(ValidationPanel, { props: { validations } })
    const text = wrapper.text()

    expect(text).toContain('t1')
    expect(text).toContain('t2')
    expect(text).toContain('lint')
    expect(text).toContain('type-check')
    expect(text).toContain('test')
    // Optional per-check output renders when present.
    expect(text).toContain('TS2345 in index.ts')
    // Human-readable status labels.
    expect(text).toContain('Passed')
    expect(text).toContain('Failed')

    // One row per validation.
    expect(wrapper.findAll('.validation')).toHaveLength(2)
    // Three checks total across the two validations.
    expect(wrapper.findAll('.check')).toHaveLength(3)
    // Status pills carry the raw status value (overall + per-check).
    const statuses = wrapper.findAll('.check-status').map(s => s.attributes('data-status'))
    expect(statuses).toEqual(['failed', 'passed', 'failed', 'passed', 'passed'])
  })

  it('shows an empty state when the room has no validations', () => {
    const wrapper = mount(ValidationPanel, { props: { validations: [] } })
    expect(wrapper.findAll('.validation')).toHaveLength(0)
    expect(wrapper.text()).toContain('No validations have run for this room yet.')
  })
})
