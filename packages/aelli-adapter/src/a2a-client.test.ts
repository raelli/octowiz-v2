import type { AelliEscalationRequest } from './index'
import { describe, expect, it } from 'vitest'
import { createA2aAelliClient, extractRecommendation } from './a2a-client'

function request(): AelliEscalationRequest {
  return {
    room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' },
    task: { id: 'tk1', roomId: 'r1', title: 'Do it', status: 'in_review', implementerId: 'impl' },
    reviews: [],
    validations: [],
    reason: 'latest validation failed',
  }
}

function fakeFetch(body: string, status = 200) {
  const calls: { url: string, init: RequestInit }[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(body, { status })
  }) as unknown as typeof fetch
  return { impl, calls }
}

/** NDJSON stream: one JSON-RPC chunk per line (the gateway's `message/stream` shape). */
function ndjson(...chunks: unknown[]): string {
  return `${chunks.map(c => JSON.stringify(c)).join('\n')}\n`
}

/** A result chunk whose artifact text is the orchestrator's double-encoded `{"text":...}`. */
function resultChunk(recommendation: string): unknown {
  return {
    jsonrpc: '2.0',
    id: 'x',
    result: {
      kind: 'task',
      artifacts: [{ artifactId: 'a', name: 'advisory', parts: [{ kind: 'text', text: JSON.stringify({ text: recommendation }) }] }],
      status: { state: 'completed' },
    },
  }
}

/** A result chunk with an explicit (non-completed) state — e.g. a progress frame. */
function resultChunkState(recommendation: string, state: string): unknown {
  return {
    jsonrpc: '2.0',
    id: 'x',
    result: {
      kind: 'task',
      artifacts: [{ parts: [{ kind: 'text', text: JSON.stringify({ text: recommendation }) }] }],
      status: { state },
    },
  }
}

/** The benign trailing error chunk the orchestrator stream appends — must be ignored. */
const trailingErrorChunk = { jsonrpc: '2.0', id: 'x', error: { code: -32603, message: 'Expecting value: line 1 column 2 (char 1)' } }

describe('extractRecommendation (NDJSON message/stream)', () => {
  it('extracts the recommendation from the result chunk and IGNORES the trailing error chunk', () => {
    const body = ndjson(resultChunk('rerun the failing checks'), trailingErrorChunk)
    expect(extractRecommendation(body)).toBe('rerun the failing checks')
  })

  it('unwraps the double-encoded artifact text ({"text":...})', () => {
    expect(extractRecommendation(ndjson(resultChunk('merge after CI is green')))).toBe('merge after CI is green')
  })

  it('uses a non-JSON artifact text directly', () => {
    const chunk = { result: { artifacts: [{ parts: [{ kind: 'text', text: 'just merge' }] }] } }
    expect(extractRecommendation(ndjson(chunk))).toBe('just merge')
  })

  it('falls back to bare {text} / {recommendation} chunks (other agents)', () => {
    expect(extractRecommendation(ndjson({ text: 'rerun' }))).toBe('rerun')
    expect(extractRecommendation(ndjson({ recommendation: 'escalate' }))).toBe('escalate')
  })

  it('returns undefined when the stream carries only an error / nothing usable', () => {
    expect(extractRecommendation(ndjson(trailingErrorChunk))).toBeUndefined()
    expect(extractRecommendation('[DONE]\n')).toBeUndefined()
    expect(extractRecommendation('\n\n')).toBeUndefined()
  })

  it('tolerates a `data:` SSE prefix', () => {
    expect(extractRecommendation(`data: ${JSON.stringify(resultChunk('ok'))}\n`)).toBe('ok')
  })

  it('throwson a real (non-benign) error chunk — even after a result (no stale success)', () => {
    const body = ndjson(resultChunk('rerun'), { jsonrpc: '2.0', error: { code: 429, message: 'rate limit' } })
    expect(() => extractRecommendation(body)).toThrow(/rate limit/)
  })

  it('throwson a real error chunk with no result', () => {
    expect(() => extractRecommendation(ndjson({ error: { code: -32000, message: 'orchestration failed' } }))).toThrow(/orchestration failed/)
  })

  it('throwson a malformed (truncated) line', () => {
    const body = `${JSON.stringify(resultChunk('x'))}\n{"error": broken\n`
    expect(() => extractRecommendation(body)).toThrow(/malformed/)
  })

  it('prefers the completed result over a non-completed progress frame (either order)', () => {
    expect(extractRecommendation(ndjson(resultChunkState('partial', 'working'), resultChunk('final')))).toBe('final')
    expect(extractRecommendation(ndjson(resultChunk('final'), resultChunkState('partial', 'working')))).toBe('final')
  })

  it('preserves a richer JSON recommendation instead of stripping fields', () => {
    const rich = JSON.stringify({ text: 'do X', why: 'Y' })
    const chunk = { result: { artifacts: [{ parts: [{ kind: 'text', text: rich }] }], status: { state: 'completed' } } }
    expect(extractRecommendation(ndjson(chunk))).toBe(rich)
  })
})

describe('createA2aAelliClient', () => {
  it('streams a JSON {query,context} event to the orchestrator and returns the recommendation', async () => {
    const { impl, calls } = fakeFetch(ndjson(resultChunk('rerun the failing checks'), trailingErrorChunk))
    const client = createA2aAelliClient({
      baseUrl: 'https://llm.integrahub.de/',
      apiKey: 'sk-test',
      fetchImpl: impl,
      newId: () => 'fixed-id',
    })

    expect(await client(request())).toBe('rerun the failing checks')

    const { url, init } = calls[0]!
    expect(url).toBe('https://llm.integrahub.de/a2a/aelli-orchestrator') // routed by agent name, slash trimmed
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
    expect(headers.Accept).toBe('text/event-stream')
    const payload = JSON.parse(init.body as string)
    expect(payload).toMatchObject({
      jsonrpc: '2.0',
      method: 'message/stream', // NOT message/send — dodges the gateway SSE-parse bug (#23)
      params: {
        message: {
          role: 'user', // required by the gateway
          messageId: 'fixed-id',
          metadata: { capability: 'aelli.decide', source: 'octowiz-v2', octowiz_doctrine: 'v1' },
        },
      },
    })
    // parts[0].text is a JSON event the orchestrator's parseEvent JSON.parses; it carries
    // the query + the structured context (NOT a plain string).
    const event = JSON.parse(payload.params.message.parts[0].text)
    expect(event.query).toBe('Task "Do it" needs a decision: latest validation failed')
    expect(event.context.task.id).toBe('tk1')
  })

  it('routes to a custom agent name when configured', async () => {
    const { impl, calls } = fakeFetch(ndjson(resultChunk('ok')))
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', agentName: 'aelli-dev-advisor', fetchImpl: impl })
    await client(request())
    expect(calls[0]!.url).toBe('https://x/a2a/aelli-dev-advisor')
  })

  it('throws on a non-2xx response', async () => {
    const { impl } = fakeFetch('', 503)
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(client(request())).rejects.toThrow(/A2A call failed: 503/)
  })

  it('throws when the stream carries no recommendation (only a trailing error)', async () => {
    const { impl } = fakeFetch(ndjson(trailingErrorChunk))
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(client(request())).rejects.toThrow(/no recommendation/)
  })

  it('uses message/send when transport:send is configured (escape hatch)', async () => {
    const { impl, calls } = fakeFetch(ndjson(resultChunk('ok')))
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', transport: 'send', fetchImpl: impl })
    await client(request())
    expect(JSON.parse(calls[0]!.init.body as string).method).toBe('message/send')
  })
})
