import { describe, expect, it, vi } from 'vitest'
import { buildSshArgs, createSshRun, ensureSession, quoteArg, runInSession, sessionName } from './index'

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

describe('quoteArg (ssh-run seam)', () => {
  it('wraps a plain token in single quotes', () => {
    expect(quoteArg('zellij')).toBe(`'zellij'`)
  })
  it('preserves a token with spaces as one quoted token', () => {
    expect(quoteArg('Room r1')).toBe(`'Room r1'`)
  })
  it('quotes an empty token so it survives re-tokenization', () => {
    expect(quoteArg('')).toBe(`''`)
  })
  it('escapes an embedded single quote via the backslash-quote idiom', () => {
    expect(quoteArg(`it's`)).toBe(`'it'\\''s'`)
  })
})

describe('buildSshArgs', () => {
  it('builds ssh host -- <quoted remote command>', () => {
    expect(buildSshArgs('elli', undefined, 'zellij', ['list-sessions', '-n', '-s']))
      .toEqual(['elli', '--', `'zellij' 'list-sessions' '-n' '-s'`])
  })
  it('prepends -o options before the host', () => {
    expect(buildSshArgs('elli', { options: { ConnectTimeout: '10' } }, 'zellij', ['run']))
      .toEqual(['-o', 'ConnectTimeout=10', 'elli', '--', `'zellij' 'run'`])
  })
  it('quotes argv containing spaces and --', () => {
    expect(buildSshArgs('elli', undefined, 'zellij', ['--session', 'octowiz-r1', 'run', '--', 'echo', 'Room r1']))
      .toEqual(['elli', '--', `'zellij' '--session' 'octowiz-r1' 'run' '--' 'echo' 'Room r1'`])
  })
})

describe('createSshRun', () => {
  it('returns code 0 + captured output on a successful remote command', async () => {
    const seen: string[][] = []
    const exec = async (sshArgs: string[]) => {
      seen.push(sshArgs)
      return { stdout: 'octowiz-elli\n', stderr: '' }
    }
    const run = createSshRun('elli', {}, exec)
    const res = await run('zellij', ['list-sessions', '-n', '-s'])
    expect(res).toEqual({ code: 0, stdout: 'octowiz-elli\n', stderr: '' })
    expect(seen[0]).toEqual(['elli', '--', `'zellij' 'list-sessions' '-n' '-s'`])
  })
  it('maps a non-zero remote exit to {code,stdout,stderr} without rejecting', async () => {
    const exec = async () => {
      // mimics execFile's rejection shape on non-zero exit
      const e: Error & { code?: number, stdout?: string, stderr?: string } = Object.assign(
        new Error('Command failed: ssh …'),
        { code: 255, stdout: '', stderr: 'Permission denied (publickey).' },
      )
      throw e
    }
    const run = createSshRun('elli', {}, exec)
    await expect(run('zellij', ['attach', '--create-background', 'octowiz-r1']))
      .resolves
      .toEqual({ code: 255, stdout: '', stderr: 'Permission denied (publickey).' })
  })
  it('is usable as the run seam for ensureSession on a remote host', async () => {
    const calls: string[][] = []
    const exec = async (sshArgs: string[]) => {
      calls.push(sshArgs)
      // first call = list-sessions (reports an existing session → no create), then nothing
      return { stdout: 'octowiz-r1\n', stderr: '' }
    }
    const sshRun = createSshRun('elli', {}, exec)
    const { ensureSession } = await import('./index')
    await ensureSession('r1', sshRun)
    expect(calls).toHaveLength(1)
    expect(calls[0]![0]).toBe('elli')
    expect(calls[0]![2]).toContain(`'list-sessions'`)
  })
})
