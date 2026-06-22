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

describe('extractRecommendation (SSE)', () => {
  it('reads a string field from the terminal data payload', () => {
    const sse = 'data: {"phase":"think"}\n\ndata: {"recommendation":"rerun the failing checks"}\n\ndata: [DONE]\n'
    expect(extractRecommendation(sse)).toBe('rerun the failing checks')
  })

  it('uses a bare string data payload directly', () => {
    expect(extractRecommendation('data: proceed with caution\n\ndata: [DONE]\n')).toBe('proceed with caution')
  })

  it('falls back to an A2A message parts[].text', () => {
    const sse = 'data: {"parts":[{"kind":"text","text":"merge after CI is green"}]}\n\ndata: [DONE]\n'
    expect(extractRecommendation(sse)).toBe('merge after CI is green')
  })

  it('throws on an error payload', () => {
    expect(() => extractRecommendation('data: {"error":"unauthorized"}\n\ndata: [DONE]\n')).toThrow(/A2A error: unauthorized/)
  })

  it('returns undefined when the stream is empty', () => {
    expect(extractRecommendation('data: [DONE]\n')).toBeUndefined()
  })
})

describe('createA2aAelliClient', () => {
  it('posts the A2A envelope to the orchestrator and returns the recommendation', async () => {
    const { impl, calls } = fakeFetch('data: {"recommendation":"rerun the failing checks"}\n\ndata: [DONE]\n')
    const client = createA2aAelliClient({
      baseUrl: 'https://llm.integrahub.de/',
      apiKey: 'sk-test',
      fetchImpl: impl,
      newId: () => 'fixed-id',
    })

    expect(await client(request())).toBe('rerun the failing checks')

    const { url, init } = calls[0]!
    expect(url).toBe('https://llm.integrahub.de/a2a/aelli-orchestrator') // routed by agent name, slash trimmed
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const payload = JSON.parse(init.body as string)
    expect(payload).toMatchObject({
      jsonrpc: '2.0',
      method: 'message/send',
      params: {
        message: {
          role: 'user', // required by the gateway
          messageId: 'fixed-id',
          parts: [{ kind: 'text', text: 'Task "Do it" needs a decision: latest validation failed' }],
          metadata: { capability: 'aelli.decide', source: 'octowiz-v2' },
        },
      },
    })
    expect(payload.params.message.metadata.context.task.id).toBe('tk1')
  })

  it('routes to a custom agent name when configured', async () => {
    const { impl, calls } = fakeFetch('data: ok\n\ndata: [DONE]\n')
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', agentName: 'aelli-dev-advisor', fetchImpl: impl })
    await client(request())
    expect(calls[0]!.url).toBe('https://x/a2a/aelli-dev-advisor')
  })

  it('throws on a non-2xx response', async () => {
    const { impl } = fakeFetch('', 503)
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(client(request())).rejects.toThrow(/A2A call failed: 503/)
  })

  it('throws when the stream carries no recommendation', async () => {
    const { impl } = fakeFetch('data: [DONE]\n')
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(client(request())).rejects.toThrow(/no recommendation/)
  })
})
