import type { AelliClient, AelliEscalationRequest } from './index'
import { randomUUID } from 'node:crypto'

/**
 * Config for the real ÆLLI seam: one A2A (JSON-RPC 2.0) `message/stream` to the deployed brain.
 * Mirrors the v0.9.23 plugin's `octowiz.escalate_to_aelli`, but goes through the LiteLLM
 * gateway, which routes by **agent name** (`/a2a/<agentName>`).
 *
 * Why `message/stream` (not `message/send`): the gateway's `message/send` path `json.loads()`
 * the orchestrator's SSE body and errors (`char 0`); its `message/stream` path streams the
 * reply as NDJSON and works. See raelli/llm_custom #23 (the `message/send` gateway bug).
 */
export interface A2aClientConfig {
  /** Gateway A2A base, e.g. `https://llm.integrahub.de` (NOT the `/v1` chat-completions base). */
  baseUrl: string
  /** LiteLLM-gateway bearer token (`LITELLM_API_KEY`). */
  apiKey: string
  /** A2A agent name to route to; defaults to the orchestrator that handles escalations. */
  agentName?: string
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Injectable id generator; defaults to `randomUUID`. Tests pass a fixed id. */
  newId?: () => string
  /** Request timeout in ms (default 60s). */
  timeoutMs?: number
}

/** First `text` string across an A2A `parts` array, if any. */
function partsText(parts: unknown): string | undefined {
  if (!Array.isArray(parts))
    return undefined
  const part = parts.find(p => typeof (p as { text?: unknown })?.text === 'string') as { text?: string } | undefined
  return part?.text
}

/**
 * The orchestrator's artifact text is itself a JSON string `{"text":"<recommendation>"}`
 * (its `handle()` returns `{ text }`, double-encoded into the part). Unwrap that; if it isn't
 * such a JSON object, use the raw string.
 */
function unwrapArtifactText(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('{')) {
    try {
      const inner = JSON.parse(t) as { text?: unknown }
      if (typeof inner.text === 'string' && inner.text.trim() !== '')
        return inner.text
    }
    catch {
      // not a JSON wrapper — fall through to the raw string
    }
  }
  return raw
}

/** Pull a recommendation out of one NDJSON JSON-RPC chunk, or undefined if it carries none. */
function chunkRecommendation(chunk: unknown): string | undefined {
  if (typeof chunk !== 'object' || chunk === null)
    return undefined
  const c = chunk as {
    result?: { artifacts?: { parts?: unknown[] }[], parts?: unknown[] }
    text?: unknown
    recommendation?: unknown
    parts?: unknown
  }
  // message/stream result chunk: result.artifacts[0].parts[0].text (a JSON string {"text":...}).
  const r = c.result
  let raw = (r && typeof r === 'object')
    ? (partsText(r.artifacts?.[0]?.parts) ?? partsText(r.parts))
    : undefined
  // Defensive fallbacks for other agents / shapes: bare {text}/{recommendation}, or bare parts.
  if (raw === undefined && typeof c.text === 'string')
    raw = c.text
  if (raw === undefined && typeof c.recommendation === 'string')
    raw = c.recommendation
  if (raw === undefined)
    raw = partsText(c.parts)
  if (raw === undefined || raw.trim() === '')
    return undefined
  return unwrapArtifactText(raw)
}

/**
 * Parse the gateway's `message/stream` reply (NDJSON: one JSON-RPC chunk per line) and return
 * the recommendation. The orchestrator emits a result chunk carrying the artifact, optionally
 * followed by a **benign trailing error chunk** — that trailer is IGNORED (a chunk with no
 * recommendation is simply skipped). Returns the last recommendation found, or undefined if the
 * stream carried none (the caller fails closed). A `data:` SSE prefix is tolerated too.
 */
export function extractRecommendation(body: string): string | undefined {
  let last: string | undefined
  for (const line of body.split(/\r?\n/)) {
    let payload = line.trim()
    if (payload === '' || payload === '[DONE]')
      continue
    if (payload.startsWith('data:'))
      payload = payload.slice(5).trim()
    if (payload === '' || payload === '[DONE]')
      continue
    let chunk: unknown
    try {
      chunk = JSON.parse(payload)
    }
    catch {
      continue
    }
    const rec = chunkRecommendation(chunk)
    if (rec !== undefined)
      last = rec
    // chunks with no recommendation (status updates, the trailing error chunk) are ignored.
  }
  return last
}

/**
 * Build the real `AelliClient`: stream an escalation to ÆLLI's orchestrator and return its
 * recommendation. The orchestrator's `parseEvent` does `JSON.parse(parts[0].text)` and reads
 * `{ query, context }`, so the question + the structured `AelliEscalationRequest` travel as a
 * JSON-stringified **event** (NOT a plain string — a plain string fails `JSON.parse` → 400).
 * `metadata` carries the octowiz tag so the octowiz system prompt is injected server-side.
 *
 * Uses `message/stream` to dodge the gateway's `message/send` SSE-parse bug (llm_custom #23).
 *
 * Fails closed, matching `recordAelliEscalation`: a non-2xx or a stream with no recommendation
 * throws, so a lost recommendation never looks like success.
 */
export function createA2aAelliClient(config: A2aClientConfig): AelliClient {
  const fetchImpl = config.fetchImpl ?? fetch
  const newId = config.newId ?? randomUUID
  const timeoutMs = config.timeoutMs ?? 60_000
  const agentName = config.agentName ?? 'aelli-orchestrator'
  const url = `${config.baseUrl.replace(/\/$/, '')}/a2a/${agentName}`

  return async (request: AelliEscalationRequest): Promise<string> => {
    const query = `Task "${request.task.title}" needs a decision: ${request.reason ?? 'no reason given'}`
    // parseEvent does JSON.parse(parts[0].text); the orchestrator reads { query, context }.
    const event = { query, context: request }
    const payload = {
      jsonrpc: '2.0',
      method: 'message/stream',
      id: newId(),
      params: {
        message: {
          // role + messageId are required by the gateway's MessageSendParams validation.
          role: 'user',
          messageId: newId(),
          parts: [{ kind: 'text', text: JSON.stringify(event) }],
          metadata: {
            capability: 'aelli.decide',
            priority: 'normal',
            source: 'octowiz-v2',
            octowiz_doctrine: 'v1',
          },
        },
      },
    }

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok)
      throw new Error(`ÆLLI A2A call failed: ${res.status} ${res.statusText}`)

    const recommendation = extractRecommendation(await res.text())
    if (recommendation === undefined)
      throw new Error('ÆLLI A2A stream carried no recommendation')
    return recommendation
  }
}
