import type { Task } from '@octowiz/schemas'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TaskStatePanel from '../../../layers/room-dashboard/app/components/TaskStatePanel.vue'

// The render path under test is RoomState.tasks -> rows (title + a TaskStatusBadge showing
// the task's status). TaskStatePanel imports TaskStatusBadge by relative path (not a Nuxt
// auto-import), so it resolves in this isolated mount. Fixtures owned by the test.
function task(over: Partial<Task> = {}): Task {
  return { id: 't1', roomId: 'demo-room', title: 'Task', status: 'open', ...over }
}

describe('taskStatePanel', () => {
  it('renders each task with its title and a status badge', () => {
    const tasks: Task[] = [
      task({ id: 't1', title: 'Wire the ledger read', status: 'in_progress' }),
      task({ id: 't2', title: 'Add the panels', status: 'in_review' }),
      task({ id: 't3', title: 'Ship it', status: 'merged' }),
    ]
    const wrapper = mount(TaskStatePanel, { props: { tasks } })
    const text = wrapper.text()

    expect(text).toContain('Wire the ledger read')
    expect(text).toContain('Add the panels')
    expect(text).toContain('Ship it')
    // Human-readable status labels from the badge.
    expect(text).toContain('In progress')
    expect(text).toContain('In review')
    expect(text).toContain('Merged')

    // One row + one badge per task; the badge carries the raw status value.
    expect(wrapper.findAll('.task')).toHaveLength(3)
    const statuses = wrapper.findAll('.task-status-badge').map(b => b.attributes('data-status'))
    expect(statuses).toEqual(['in_progress', 'in_review', 'merged'])
  })

  it('shows an empty state when the room has no tasks', () => {
    const wrapper = mount(TaskStatePanel, { props: { tasks: [] } })
    expect(wrapper.findAll('.task')).toHaveLength(0)
    expect(wrapper.text()).toContain('This room has no tasks yet.')
  })
})
