import type { OpencodeEngine, OpencodeSessionHandle } from './driver'
import { describe, expect, it } from 'vitest'
import { driveSession } from './driver'

/**
 * Hand-written fake handle that records every call so tests can assert the
 * lifecycle (and that shutdown is ALWAYS invoked). No network, no real SDK.
 */
interface FakeHandleOptions {
  healthy?: boolean
  sessionId?: string
  promptText?: string
  promptError?: Error
  healthError?: Error
}

interface FakeHandle extends OpencodeSessionHandle {
  calls: string[]
  shutdownCount: number
}

function makeHandle(opts: FakeHandleOptions = {}): FakeHandle {
  const calls: string[] = []
  const handle: FakeHandle = {
    calls,
    shutdownCount: 0,
    async health() {
      calls.push('health')
      if (opts.healthError)
        throw opts.healthError
      return { healthy: opts.healthy ?? true }
    },
    async createSession(title: string) {
      calls.push(`createSession:${title}`)
      return { id: opts.sessionId ?? 'session-1' }
    },
    async prompt(sessionId: string, text: string) {
      calls.push(`prompt:${sessionId}:${text}`)
      if (opts.promptError)
        throw opts.promptError
      return { text: opts.promptText ?? '' }
    },
    async shutdown() {
      calls.push('shutdown')
      handle.shutdownCount += 1
    },
  }
  return handle
}

interface FakeEngineOptions extends FakeHandleOptions {
  startError?: Error
}

function makeEngine(opts: FakeEngineOptions = {}): { engine: OpencodeEngine, getHandle: () => FakeHandle | undefined } {
  let handle: FakeHandle | undefined
  const engine: OpencodeEngine = {
    async start() {
      if (opts.startError)
        throw opts.startError
      handle = makeHandle(opts)
      return handle
    },
  }
  return { engine, getHandle: () => handle }
}

describe('driveSession', () => {
  it('happy path: returns assistant text and shuts down', async () => {
    const { engine, getHandle } = makeEngine({ promptText: 'all done' })
    const result = await driveSession(engine, { title: 'Add login' })
    expect(result.text).toBe('all done')
    expect(getHandle()?.shutdownCount).toBe(1)
  })

  it('happy path: combines title + description into the prompt', async () => {
    const { engine, getHandle } = makeEngine({ promptText: 'ok' })
    await driveSession(engine, { title: 'Add login', description: 'OAuth flow' })
    const promptCall = getHandle()?.calls.find(c => c.startsWith('prompt:'))
    expect(promptCall).toContain('Add login')
    expect(promptCall).toContain('OAuth flow')
  })

  it('omits description cleanly when absent (no "undefined" in prompt)', async () => {
    const { engine, getHandle } = makeEngine({ promptText: 'ok' })
    await driveSession(engine, { title: 'Add login' })
    const promptCall = getHandle()?.calls.find(c => c.startsWith('prompt:'))
    expect(promptCall).toContain('Add login')
    expect(promptCall).not.toContain('undefined')
  })

  it('fails closed: unhealthy server throws and shutdown still called', async () => {
    const { engine, getHandle } = makeEngine({ healthy: false })
    await expect(driveSession(engine, { title: 'x' })).rejects.toThrow()
    expect(getHandle()?.shutdownCount).toBe(1)
    expect(getHandle()?.calls).not.toContain('createSession:x')
  })

  it('fails closed: start rejecting throws (no handle, no shutdown to call)', async () => {
    const { engine, getHandle } = makeEngine({ startError: new Error('server never booted') })
    await expect(driveSession(engine, { title: 'x' })).rejects.toThrow('server never booted')
    expect(getHandle()).toBeUndefined()
  })

  it('fails closed: failed prompt throws and shutdown still called', async () => {
    const { engine, getHandle } = makeEngine({ promptError: new Error('prompt blew up') })
    await expect(driveSession(engine, { title: 'x' })).rejects.toThrow('prompt blew up')
    expect(getHandle()?.shutdownCount).toBe(1)
  })

  it('fails closed: empty result throws (not silent success) and shutdown still called', async () => {
    const { engine, getHandle } = makeEngine({ promptText: '' })
    await expect(driveSession(engine, { title: 'x' })).rejects.toThrow()
    expect(getHandle()?.shutdownCount).toBe(1)
  })

  it('fails closed: whitespace-only result throws', async () => {
    const { engine, getHandle } = makeEngine({ promptText: '   \n  ' })
    await expect(driveSession(engine, { title: 'x' })).rejects.toThrow()
    expect(getHandle()?.shutdownCount).toBe(1)
  })
})
