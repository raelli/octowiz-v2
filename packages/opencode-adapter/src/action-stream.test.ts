import type { Event, ToolPart } from '@opencode-ai/sdk'
import type { RecordAction, ToolEvent } from './action-stream'
import { describe, expect, it, vi } from 'vitest'
import { streamActionsToLedger, summariseToolInput, toToolEvent } from './action-stream'

/**
 * Fake normalized stream: a plain async generator over hand-written ToolEvents.
 * No SDK, no network — the unit under test (streamActionsToLedger) only sees the seam.
 */
async function* fakeStream(events: ToolEvent[]): AsyncIterable<ToolEvent> {
  for (const event of events)
    yield event
}

/** Fake ledger that records every call so tests can assert one-per-event. */
function makeRecorder(): { recordAction: RecordAction, calls: Array<{ tool: string, summary: string, taskId?: string }> } {
  const calls: Array<{ tool: string, summary: string, taskId?: string }> = []
  const recordAction: RecordAction = async (action) => {
    calls.push(action)
  }
  return { recordAction, calls }
}

describe('streamActionsToLedger', () => {
  it('records one action per completed tool event with the right tool/summary', async () => {
    const { recordAction, calls } = makeRecorder()
    const events: ToolEvent[] = [
      { tool: 'read', summary: '{"path":"a.ts"}', callID: 'c1' },
      { tool: 'edit', summary: '{"path":"b.ts"}', callID: 'c2' },
      { tool: 'bash', summary: '{"cmd":"ls"}', callID: 'c3' },
    ]

    await streamActionsToLedger(fakeStream(events), recordAction)

    expect(calls).toHaveLength(3)
    expect(calls.map(c => c.tool)).toEqual(['read', 'edit', 'bash'])
    expect(calls.map(c => c.summary)).toEqual(['{"path":"a.ts"}', '{"path":"b.ts"}', '{"cmd":"ls"}'])
  })

  it('threads taskId through to every recorded action when provided', async () => {
    const { recordAction, calls } = makeRecorder()
    const events: ToolEvent[] = [
      { tool: 'read', summary: 's1', callID: 'c1' },
      { tool: 'edit', summary: 's2', callID: 'c2' },
    ]

    await streamActionsToLedger(fakeStream(events), recordAction, { taskId: 'task-42' })

    expect(calls).toHaveLength(2)
    expect(calls.every(c => c.taskId === 'task-42')).toBe(true)
  })

  it('omits taskId cleanly when absent (key not present)', async () => {
    const { recordAction, calls } = makeRecorder()
    const events: ToolEvent[] = [{ tool: 'read', summary: 's1', callID: 'c1' }]

    await streamActionsToLedger(fakeStream(events), recordAction)

    expect(calls).toHaveLength(1)
    expect('taskId' in calls[0]!).toBe(false)
  })

  it('non-aborting failure: a recordAction rejection does NOT stop the loop; remaining events still recorded; onError called once', async () => {
    const calls: Array<{ tool: string, summary: string, taskId?: string }> = []
    // recordAction only gets {tool, summary, taskId?}, so encode the failing one by tool name.
    const failingRecorder: RecordAction = async (action) => {
      if (action.tool === 'edit')
        throw new Error('ledger write failed')
      calls.push(action)
    }
    const onError = vi.fn()
    const events: ToolEvent[] = [
      { tool: 'read', summary: 's1', callID: 'c1' },
      { tool: 'edit', summary: 's2', callID: 'c2' },
      { tool: 'bash', summary: 's3', callID: 'c3' },
    ]

    await streamActionsToLedger(fakeStream(events), failingRecorder, { onError })

    // The two non-failing events were still recorded — the session was NOT aborted.
    expect(calls.map(c => c.tool)).toEqual(['read', 'bash'])
    expect(onError).toHaveBeenCalledTimes(1)
    const [err, event] = onError.mock.calls[0]!
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('ledger write failed')
    expect(event).toEqual({ tool: 'edit', summary: 's2', callID: 'c2' })
  })
})

describe('summariseToolInput', () => {
  it('is a deterministic compact JSON of the input', () => {
    expect(summariseToolInput({ path: 'a.ts', n: 1 })).toBe('{"path":"a.ts","n":1}')
  })

  it('truncates to ~200 chars', () => {
    const big = { blob: 'x'.repeat(500) }
    const out = summariseToolInput(big)
    expect(out.length).toBeLessThanOrEqual(200)
  })

  // The ledger is plaintext and long-lived — tool inputs must never carry
  // credentials into it verbatim.
  it('redacts values of secret-named keys, including nested ones', () => {
    const out = summariseToolInput({
      apiKey: 'sk-abc123',
      headers: { Authorization: 'Bearer xyz', accept: 'application/json' },
      path: 'a.ts',
    })
    expect(out).not.toContain('sk-abc123')
    expect(out).not.toContain('Bearer xyz')
    expect(out).toContain('[redacted]')
    expect(out).toContain('application/json') // non-secret sibling survives
    expect(out).toContain('a.ts')
  })

  it('scrubs credential-shaped substrings inside string values', () => {
    const out = summariseToolInput({
      command: 'curl -H "Authorization: Bearer sk-live-Abc123XYZssecret" https://api.example.com',
    })
    expect(out).not.toContain('sk-live-Abc123XYZssecret')
    expect(out).toContain('curl')
    expect(out).toContain('https://api.example.com')

    const env = summariseToolInput({ command: 'AELLI_AUTH_TOKEN=supersecretvalue node run.js' })
    expect(env).not.toContain('supersecretvalue')
    expect(env).toContain('node run.js')
  })

  it('scrubs well-known key prefixes (github, slack, aws)', () => {
    // Canary fixtures assembled at runtime so the repo's own secretlint
    // pre-commit gate doesn't flag them as real credentials.
    const github = ['ghp', '16C7e42F292c6912E7710c838347Ae178B4a'].join('_')
    const slackThenAws = ['xoxb', '2534', 'and', 'AKIAIOSFODNN7EXAMPLE'].join('-')
    const out = summariseToolInput({ command: `echo ${github} && echo ${slackThenAws}` })
    expect(out).not.toContain(github)
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(out).not.toContain(['xoxb', '2534'].join('-'))
  })
})

/** Build a synthetic SDK message.part.updated Event around a ToolPart. */
function partUpdatedEvent(part: ToolPart): Event {
  return { type: 'message.part.updated', properties: { part } }
}

function toolPart(callID: string, status: ToolPart['state']['status'], input: Record<string, unknown> = {}): ToolPart {
  const base = { id: `part-${callID}`, sessionID: 's', messageID: 'm', type: 'tool' as const, callID, tool: 'read' }
  if (status === 'completed')
    return { ...base, state: { status, input, output: 'ok', title: 't', metadata: {}, time: { start: 0, end: 1 } } }
  if (status === 'running')
    return { ...base, state: { status, input, metadata: {}, time: { start: 0 } } }
  if (status === 'error')
    return { ...base, state: { status, input, error: 'e', metadata: {}, time: { start: 0, end: 1 } } }
  return { ...base, state: { status: 'pending', input, raw: '' } }
}

describe('toToolEvent (pure SDK-shape filter + normaliser)', () => {
  it('returns a ToolEvent for a completed tool part', () => {
    const event = partUpdatedEvent(toolPart('c1', 'completed', { path: 'a.ts' }))
    expect(toToolEvent(event)).toEqual({ tool: 'read', summary: '{"path":"a.ts"}', callID: 'c1' })
  })

  it('returns undefined for pending/running/error states (only completed is recorded)', () => {
    expect(toToolEvent(partUpdatedEvent(toolPart('c1', 'pending')))).toBeUndefined()
    expect(toToolEvent(partUpdatedEvent(toolPart('c1', 'running')))).toBeUndefined()
    expect(toToolEvent(partUpdatedEvent(toolPart('c1', 'error')))).toBeUndefined()
  })

  it('returns undefined for non-tool parts and non-part-updated events', () => {
    const textPart: Event = {
      type: 'message.part.updated',
      properties: { part: { id: 'p', sessionID: 's', messageID: 'm', type: 'text', text: 'hi' } as never },
    }
    expect(toToolEvent(textPart)).toBeUndefined()
    expect(toToolEvent({ type: 'session.idle', properties: { sessionID: 's' } } as Event)).toBeUndefined()
  })

  it('dedupes by callID across repeated completed emissions: same callID twice → mapped once when filtered through a deduper', () => {
    // Simulate the pending→running→completed→completed transitions for one call.
    const stream: Event[] = [
      partUpdatedEvent(toolPart('c1', 'pending')),
      partUpdatedEvent(toolPart('c1', 'running')),
      partUpdatedEvent(toolPart('c1', 'completed', { path: 'a.ts' })),
      partUpdatedEvent(toolPart('c1', 'completed', { path: 'a.ts' })), // duplicate completed
      partUpdatedEvent(toolPart('c2', 'completed', { path: 'b.ts' })),
    ]

    const seen = new Set<string>()
    const recorded: ToolEvent[] = []
    for (const ev of stream) {
      const te = toToolEvent(ev)
      if (!te || seen.has(te.callID))
        continue
      seen.add(te.callID)
      recorded.push(te)
    }

    expect(recorded.map(r => r.callID)).toEqual(['c1', 'c2'])
  })
})
