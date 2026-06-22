import { describe, expect, it } from 'vitest'
import { createAelliRouterWorker, parseRouterResult } from './aelli-router-worker'

// The exact SSE envelope captured live from /a2a/aelli-router: `data: <json>` lines
// terminated by `data: [DONE]`. A workflow stream is phase events, then the final result.
const WORKFLOW_SSE = [
  'data: {"phase":"generate","router":"coding"}',
  '',
  'data: {"phase":"review","verdict":"CHANGES"}',
  '',
  'data: {"route":{"router":"coding"},"workflow":"standard","phases":["generate","review"],"output":"export const add = (a, b) => a + b","verdict":"PASS","revisionCount":1}',
  '',
  'data: [DONE]',
  '',
].join('\n')

function fakeFetch(body: string, status = 200) {
  const calls: { url: string, init: RequestInit }[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(body, { status })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('parseRouterResult', () => {
  it('returns the terminal result payload, ignoring intermediate phase events', () => {
    const r = parseRouterResult(WORKFLOW_SSE)
    expect(r.output).toBe('export const add = (a, b) => a + b')
    expect(r.verdict).toBe('PASS')
  })

  it('throws when the stream carries no result payload', () => {
    expect(() => parseRouterResult('data: {"phase":"generate"}\n\ndata: [DONE]\n')).toThrow(/no result payload/)
  })
})

describe('createAelliRouterWorker', () => {
  it('posts the workflow envelope and returns the output as text', async () => {
    const { impl, calls } = fakeFetch(WORKFLOW_SSE)
    const worker = createAelliRouterWorker({
      baseUrl: 'https://llm.integrahub.de/',
      apiKey: 'sk-test',
      fetchImpl: impl,
      newId: () => 'fixed-id',
    })

    const out = await worker({ role: 'implementer', prompt: 'add two numbers' })
    expect(out.text).toBe('export const add = (a, b) => a + b')

    const { url, init } = calls[0]!
    expect(url).toBe('https://llm.integrahub.de/a2a/aelli-router') // trailing slash trimmed
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const payload = JSON.parse(init.body as string)
    expect(payload).toMatchObject({
      jsonrpc: '2.0',
      method: 'message/send',
      params: { message: { metadata: { capability: 'aelli-router:workflow', source: 'octowiz-v2', octowiz_doctrine: 'v1' } } },
    })
    const event = JSON.parse(payload.params.message.parts[0].text)
    expect(event).toEqual({ type: 'workflow', content: 'add two numbers', taskKind: 'implementer' })
  })

  it('throws on a non-2xx response', async () => {
    const { impl } = fakeFetch('', 502)
    const worker = createAelliRouterWorker({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(worker({ role: 'implementer', prompt: 'x' })).rejects.toThrow(/router call failed: 502/)
  })

  it('throws on a workflow error payload', async () => {
    const { impl } = fakeFetch('data: {"error":"model timeout"}\n\ndata: [DONE]\n')
    const worker = createAelliRouterWorker({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(worker({ role: 'implementer', prompt: 'x' })).rejects.toThrow(/workflow error: model timeout/)
  })

  it('throws when output is empty even if verdict is present', async () => {
    const { impl } = fakeFetch('data: {"output":"","verdict":"FAIL"}\n\ndata: [DONE]\n')
    const worker = createAelliRouterWorker({ baseUrl: 'https://x', apiKey: 'k', fetchImpl: impl })
    await expect(worker({ role: 'reviewer', prompt: 'x' })).rejects.toThrow(/no output \(verdict=FAIL\)/)
  })
})
