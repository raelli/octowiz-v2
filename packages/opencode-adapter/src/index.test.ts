import { expect, it } from 'vitest'
import { startArgs } from './index'

it('builds argv starting with opencode', () => {
  expect(startArgs('/repos/app', { title: 'Add login' })[0]).toBe('opencode')
})

it('passes the repo path', () => {
  expect(startArgs('/repos/app', { title: 'Add login' })).toContain('/repos/app')
})

it('includes the task title in the argv', () => {
  expect(startArgs('/repos/app', { title: 'Add login' }).join(' ')).toContain('Add login')
})

it('includes the description when present', () => {
  const argv = startArgs('/repos/app', { title: 'Add login', description: 'OAuth flow' })
  const joined = argv.join(' ')
  expect(joined).toContain('Add login')
  expect(joined).toContain('OAuth flow')
})

it('omits description cleanly when absent', () => {
  const argv = startArgs('/repos/app', { title: 'Add login' })
  expect(argv.join(' ')).toContain('Add login')
  expect(argv.join(' ')).not.toContain('undefined')
})
