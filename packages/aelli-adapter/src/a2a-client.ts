import type { AelliClient, AelliEscalationRequest } from './index'
import { randomUUID } from 'node:crypto'

/**
 * Config for the real ÆLLI seam: one A2A (JSON-RPC 2.0) `message/send` to the deployed brain.
 * Mirrors the v0.9.23 plugin's `octowiz.escalate_to_aelli` (capability `aelli.decide`), but
 * goes through the LiteLLM gateway, which routes by **agent name** (`/a2a/<agentName>`) and
 * streams the reply as SSE.
 */
export interface A2aClientConfig {
  /** Gateway A2A base, e.g. `https://llm.integrahub.de` (NOT the `/v1` chat-completions base). */
  baseUrl: string
  /** LiteLLM-gateway bearer token (`LITELLM_API_KEY`). */
  apiKey: string
  /** A2A agent name to route to; defaults to the orchestrator that owns `aelli.decide`. */
  agentName?: string
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Injectable id generator; defaults to `randomUUID`. Tests pass a fixed id. */
  newId?: () => string
  /** Request timeout in ms (default 60s). */
  timeoutMs?: number
}

/**
 * The gateway streams Server-Sent Events: `data: <json>` lines terminated by `data: [DONE]`,
 * each payload being the skill's own object (confirmed live against `/a2a/aelli-router`). Pull
 * the recommendation out of the terminal payload.
 *
 * NOTE: the exact `aelli.decide` field is UNVERIFIED — a live decide probe returned 401 from the
 * internal aelli (the gateway does not forward the aelli auth secret yet), so end-to-end could
 * not be confirmed. Extraction is therefore defensive: a string payload is used directly; an
 * object is checked for the common text fields, then a bare A2A message's `parts[0].text`, then
 * stringified as a last resort. Tighten once the 401 is resolved and the shape is observed.
 */
export function extractRecommendation(body: string): string | undefined {
  let last: unknown
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:'))
      continue
    const payload = line.slice(5).trim()
    if (payload === '' || payload === '[DONE]')
      continue
    try {
      last = JSON.parse(payload)
    }
    catch {
      // A non-JSON data line: keep the raw text as a candidate.
      last = payload
    }
  }
  if (last === undefined)
    return undefined
  if (typeof last === 'string')
    return last.trim() === '' ? undefined : last
  if (typeof last === 'object' && last !== null) {
    const o = last as Record<string, unknown>
    if (o.error !== undefined)
      throw new Error(`ÆLLI A2A error: ${typeof o.error === 'string' ? o.error : JSON.stringify(o.error)}`)
    for (const key of ['recommendation', 'decision', 'answer', 'text', 'output', 'message'] as const) {
      if (typeof o[key] === 'string' && (o[key] as string).trim() !== '')
        return o[key] as string
    }
    // Bare A2A message: { parts: [{ kind: 'text', text }] }
    const parts = (o as { parts?: unknown[] }).parts
    if (Array.isArray(parts)) {
      const part = parts.find(p => typeof (p as { text?: unknown })?.text === 'string') as { text?: string } | undefined
      if (part?.text)
        return part.text
    }
    return JSON.stringify(last)
  }
  return undefined
}

/**
 * Build the real `AelliClient`: POST an escalation to ÆLLI's orchestrator and return its
 * recommendation. The structured `AelliEscalationRequest` rides in `metadata.context`;
 * `parts[0].text` carries a human-readable question so raw A2A traffic is legible.
 *
 * Fails closed, matching `recordAelliEscalation`: a non-2xx, a JSON-RPC error, or a response
 * with no recommendation all throw, so a lost recommendation never looks like success.
 */
export function createA2aAelliClient(config: A2aClientConfig): AelliClient {
  const fetchImpl = config.fetchImpl ?? fetch
  const newId = config.newId ?? randomUUID
  const timeoutMs = config.timeoutMs ?? 60_000
  const agentName = config.agentName ?? 'aelli-orchestrator'
  const url = `${config.baseUrl.replace(/\/$/, '')}/a2a/${agentName}`

  return async (request: AelliEscalationRequest): Promise<string> => {
    const question = `Task "${request.task.title}" needs a decision: ${request.reason ?? 'no reason given'}`
    const payload = {
      jsonrpc: '2.0',
      method: 'message/send',
      id: newId(),
      params: {
        message: {
          // role + messageId are required by the gateway's MessageSendParams validation.
          role: 'user',
          messageId: newId(),
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

    const recommendation = extractRecommendation(await res.text())
    if (recommendation === undefined)
      throw new Error('ÆLLI A2A response carried no recommendation')
    return recommendation
  }
}
