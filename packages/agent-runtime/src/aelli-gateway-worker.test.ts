import { describe, expect, it, vi } from 'vitest'
import { createAelliGatewayWorker } from './aelli-gateway-worker'

function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createAelliGatewayWorker', () => {
  const config = { baseUrl: 'https://gw.example/v1', apiKey: 'k' }

  it('posts model + prompt to /chat/completions and returns the content', async () => {
    let calledUrl = ''
    let calledInit: RequestInit | undefined
    const fetchImpl: typeof fetch = async (url, init) => {
      calledUrl = String(url)
      calledInit = init
      return okResponse('the advice')
    }
    const worker = createAelliGatewayWorker('cheap-model', { ...config, fetchImpl })
    const out = await worker({ role: 'advisor', prompt: 'help' })
    expect(out.text).toBe('the advice')
    expect(calledUrl).toBe('https://gw.example/v1/chat/completions')
    const body = JSON.parse((calledInit?.body as string))
    expect(body.model).toBe('cheap-model')
    expect(body.messages).toEqual([{ role: 'user', content: 'help' }])
  })

  it('throws on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    const worker = createAelliGatewayWorker('cheap-model', { ...config, fetchImpl })
    await expect(worker({ role: 'advisor', prompt: 'help' })).rejects.toThrow(/500/)
  })

  it('throws on empty content', async () => {
    const fetchImpl = vi.fn(async () => okResponse('   '))
    const worker = createAelliGatewayWorker('cheap-model', { ...config, fetchImpl })
    await expect(worker({ role: 'advisor', prompt: 'help' })).rejects.toThrow(/no output/)
  })
})
