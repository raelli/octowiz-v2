import type { AelliClient, AelliEscalationRequest } from './index'
import { randomUUID } from 'node:crypto'

/**
 * Config for the real ÆLLI seam: one A2A (JSON-RPC 2.0) HTTP call. The shape mirrors the
 * v0.9.23 plugin's `octowiz.escalate_to_aelli` capability — same endpoint (`/a2a/aelli`),
 * same `message/send` method, same `aelli.decide` capability metadata — so v2 talks to the
 * already-deployed brain rather than reimplementing it.
 */
export interface A2aClientConfig {
  /** ÆLLI A2A base, e.g. `https://llm.integrahub.de`. The `/a2a/aelli` path is appended. */
  baseUrl: string
  /** LiteLLM-gateway bearer token (`LITELLM_API_KEY`). */
  apiKey: string
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Injectable id generator; defaults to `randomUUID`. Tests pass a fixed id. */
  newId?: () => string
  /** Request timeout in ms (default 30s). */
  timeoutMs?: number
}

interface A2aResponse {
  result?: unknown
  error?: { message?: string }
}

/**
 * Pull ÆLLI's recommendation text out of a JSON-RPC `result`, which is either a Task
 * (`{ artifacts: [{ parts }] }`) or a bare Message (`{ parts }`). First text part wins;
 * falls back to the first part. Returns undefined if no usable text is present.
 */
function extractText(result: unknown): string | undefined {
  const r = result as { artifacts?: { parts?: unknown[] }[], parts?: unknown[] } | undefined
  const parts = r?.artifacts?.[0]?.parts ?? r?.parts
  if (!Array.isArray(parts))
    return undefined
  const isTextPart = (p: unknown): p is { text: string } =>
    typeof (p as { text?: unknown })?.text === 'string'
  const part = parts.find(p => (p as { kind?: string })?.kind === 'text' && isTextPart(p)) ?? parts[0]
  return isTextPart(part) ? part.text : undefined
}

/**
 * Build the real `AelliClient`: an injected async fn that POSTs an escalation to ÆLLI and
 * returns its recommendation string. The full `AelliEscalationRequest` rides in
 * `metadata.context` (the structured signal); `parts[0].text` carries a human-readable
 * question so a log of the A2A traffic is legible on its own.
 *
 * Fails closed, matching `recordAelliEscalation` — a non-2xx, a JSON-RPC error, or a
 * response with no text part all throw, so a lost recommendation never looks like success.
 */
export function createA2aAelliClient(config: A2aClientConfig): AelliClient {
  const fetchImpl = config.fetchImpl ?? fetch
  const newId = config.newId ?? randomUUID
  const timeoutMs = config.timeoutMs ?? 30_000
  const url = `${config.baseUrl.replace(/\/$/, '')}/a2a/aelli`

  return async (request: AelliEscalationRequest): Promise<string> => {
    const question = `Task "${request.task.title}" needs a decision: ${request.reason ?? 'no reason given'}`
    const payload = {
      jsonrpc: '2.0',
      method: 'message/send',
      id: newId(),
      params: {
        message: {
          parts: [{ kind: 'text', text: question }],
          metadata: {
            capability: 'aelli.decide',
            context: request,
            priority: 'normal',
            source: 'octowiz-v2',
          },
        },
      },
    }

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok)
      throw new Error(`ÆLLI A2A call failed: ${res.status} ${res.statusText}`)

    const body = await res.json() as A2aResponse
    if (body.error)
      throw new Error(`ÆLLI A2A error: ${body.error.message ?? JSON.stringify(body.error)}`)

    const text = extractText(body.result)
    if (text === undefined)
      throw new Error(`ÆLLI A2A response had no text part: ${JSON.stringify(body.result)}`)
    return text
  }
}
