import { ValidationSchema } from '@octowiz/schemas'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHECKS, runValidation } from './index'

describe('runValidation', () => {
  it('passes when every check exits 0', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' })
    const v = await runValidation('t1', DEFAULT_CHECKS, run, '2026-06-21T00:00:00Z')
    expect(v.status).toBe('passed')
    expect(v.taskId).toBe('t1')
    expect(v.checks).toHaveLength(DEFAULT_CHECKS.length)
    expect(v.checks.every(c => c.status === 'passed')).toBe(true)
  })

  it('fails overall when any check exits non-zero, capturing output', async () => {
    const checks = [
      { name: 'lint', cmd: 'pnpm', args: ['lint'] },
      { name: 'test', cmd: 'pnpm', args: ['-r', 'test'] },
    ]
    const run = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'ok', stderr: '' })
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'boom' })
    const v = await runValidation('t1', checks, run, '2026-06-21T00:00:00Z')
    expect(v.status).toBe('failed')
    expect(v.checks.find(c => c.name === 'test')?.status).toBe('failed')
    expect(v.checks.find(c => c.name === 'test')?.output).toContain('boom')
  })

  it('produces a Validation that parses against the schema', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: 'ok', stderr: '' })
    const v = await runValidation('t1', DEFAULT_CHECKS, run, '2026-06-21T00:00:00Z')
    expect(() => ValidationSchema.parse(v)).not.toThrow()
    expect(v.createdAt).toBe('2026-06-21T00:00:00Z')
  })

  it('runs each check exactly once, in order', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await runValidation('t1', DEFAULT_CHECKS, run, '2026-06-21T00:00:00Z')
    expect(run).toHaveBeenCalledTimes(DEFAULT_CHECKS.length)
  })
})
