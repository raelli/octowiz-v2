import type { AelliEscalationRequest } from './index'
import { describe, expect, it } from 'vitest'
import { createA2aAelliClient } from './a2a-client'

function request(): AelliEscalationRequest {
  return {
    room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' },
    task: { id: 'tk1', roomId: 'r1', title: 'Do it', status: 'in_review', implementerId: 'impl' },
    reviews: [],
    validations: [],
    reason: 'latest validation failed',
  }
}

/** A fetch double that records its last call and returns a scripted Response. */
function fakeFetch(response: Response) {
  const calls: { url: string, init: RequestInit }[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return response
  }) as unknown as typeof fetch
  return { impl, calls }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('createA2aAelliClient', () => {
  it('posts the A2A envelope and returns the artifact text', async () => {
    const { impl, calls } = fakeFetch(jsonResponse({
      jsonrpc: '2.0',
      id: 'fixed-id',
      result: { artifacts: [{ parts: [{ kind: 'text', text: 'aelli says: rerun the failing checks' }] }] },
    }))
    const client = createA2aAelliClient({
      baseUrl: 'https://llm.integrahub.de/',
      apiKey: 'sk-test',
      fetchImpl: impl,
      newId: () => 'fixed-id',
    })

    const recommendation = await client(request())
    expect(recommendation).toBe('aelli says: rerun the failing checks')

    const { url, init } = calls[0]!
    expect(url).toBe('https://llm.integrahub.de/a2a/aelli') // trailing slash trimmed, no /message/send
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const payload = JSON.parse(init.body as string)
    expect(payload).toMatchObject({
      jsonrpc: '2.0',
      method: 'message/send',
      id: 'fixed-id',
      params: {
        message: {
          parts: [{ kind: 'text', text: 'Task "Do it" needs a decision: latest validation failed' }],
          metadata: { capability: 'aelli.decide', source: 'octowiz-v2' },
        },
      },
    })
    // The structured request rides in metadata.context.
    expect(payload.params.message.metadata.context.task.id).toBe('tk1')
  })

  it('also reads a bare Message result (parts without artifacts)', async () => {
    const { impl } = fakeFetch(jsonResponse({
      result: { kind: 'message', parts: [{ kind: 'text', text: 'proceed' }] },
    }))
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    expect(await client(request())).toBe('proceed')
  })

  it('throws on a non-2xx response — no swallowing', async () => {
    const { impl } = fakeFetch(jsonResponse({}, 503))
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(client(request())).rejects.toThrow(/A2A call failed: 503/)
  })

  it('throws on a JSON-RPC error', async () => {
    const { impl } = fakeFetch(jsonResponse({ error: { message: 'bad capability' } }))
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(client(request())).rejects.toThrow(/A2A error: bad capability/)
  })

  it('throws when the result carries no text part', async () => {
    const { impl } = fakeFetch(jsonResponse({ result: { artifacts: [{ parts: [] }] } }))
    const client = createA2aAelliClient({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(client(request())).rejects.toThrow(/no text part/)
  })
})
