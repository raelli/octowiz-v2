import { describe, expect, it, vi } from 'vitest'
import { ensureSession, runInSession, sessionName } from './index'

const ok = { code: 0, stdout: '', stderr: '' }

describe('sessionName', () => {
  it('derives octowiz-<roomId>', () => {
    expect(sessionName('r1')).toBe('octowiz-r1')
  })
})

describe('ensureSession', () => {
  it('creates a detached session when absent', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'other-session\n', stderr: '' }) // list-sessions
      .mockResolvedValueOnce(ok) // create
    await ensureSession('r1', run)
    expect(run).toHaveBeenCalledTimes(2)
    const [listCall, createCall] = run.mock.calls
    expect(listCall![0]).toBe('zellij')
    expect(listCall![1]).toContain('list-sessions')
    expect(createCall![1]).toContain('octowiz-r1')
  })

  it('is a no-op when the session already exists', async () => {
    const run = vi.fn().mockResolvedValueOnce({ code: 0, stdout: 'octowiz-r1\n', stderr: '' })
    await ensureSession('r1', run)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('ignores ANSI/suffixes when matching session names', async () => {
    const run = vi.fn().mockResolvedValueOnce({ code: 0, stdout: 'octowiz-r1 [Created 1h ago] (current)\n', stderr: '' })
    await ensureSession('r1', run)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not partial-match a different session', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'octowiz-r10\n', stderr: '' }) // not r1
      .mockResolvedValueOnce(ok)
    await ensureSession('r1', run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('throws when creation fails', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'boom' })
    await expect(ensureSession('r1', run)).rejects.toThrow(/boom/)
  })
})

describe('runInSession', () => {
  it('launches argv in the room session', async () => {
    const run = vi.fn().mockResolvedValue(ok)
    await runInSession('r1', ['echo', 'hi'], run)
    const [cmd, args] = run.mock.calls[0]!
    expect(cmd).toBe('zellij')
    expect(args).toContain('octowiz-r1')
    expect(args.slice(args.indexOf('echo'))).toEqual(['echo', 'hi'])
  })

  it('throws when the launch fails', async () => {
    const run = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'nope' })
    await expect(runInSession('r1', ['echo'], run)).rejects.toThrow(/nope/)
  })
})
