import type { AgentWorker } from './index'

export interface AelliGatewayWorkerConfig {
  baseUrl: string
  apiKey: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface ChatCompletion {
  choices?: { message?: { content?: unknown } }[]
}

/**
 * Build an `AgentWorker` backed by one flat chat completion against `modelId`.
 * The advisor role is not sent to the gateway; only the prompt is forwarded.
 */
export function createAelliGatewayWorker(modelId: string, config: AelliGatewayWorkerConfig): AgentWorker {
  const fetchImpl = config.fetchImpl ?? fetch
  const timeoutMs = config.timeoutMs ?? 120_000
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`

  return async ({ prompt }) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok)
      throw new Error(`ÆLLI gateway call failed: ${res.status} ${res.statusText}`)

    const body = await res.json() as ChatCompletion
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim() === '')
      throw new Error(`ÆLLI gateway model \"${modelId}\" produced no output`)
    return { text: content }
  }
}
