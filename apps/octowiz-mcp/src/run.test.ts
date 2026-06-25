import { describe, expect, it } from 'vitest'
import { defaultRun } from './run.js'

describe('defaultRun', () => {
  it('captures stdout and code 0 on success', async () => {
    const r = await defaultRun('node', ['-e', 'process.stdout.write("hi")'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('hi')
  })

  it('returns non-zero code instead of throwing on failure', async () => {
    const r = await defaultRun('node', ['-e', 'process.exit(3)'])
    expect(r.code).toBe(3)
  })
})
