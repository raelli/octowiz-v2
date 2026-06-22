import type { AelliClient, AelliEscalationRequest } from './index'
import { randomUUID } from 'node:crypto'
import process from 'node:process'

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
  /**
   * A2A transport. `stream` (default) uses `message/stream` to dodge the gateway's
   * `message/send` SSE-parse bug (llm_custom #23); `send` is the escape hatch if a deployment
   * fixes `message/send` but disables streaming. Env override: `OCTOWIZ_A2A_TRANSPORT`.
   */
  transport?: 'stream' | 'send'
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Injectable id generator; defaults to `randomUUID`. Tests pass a fixed id. */
  newId?: () => string
  /**
   * Outer request timeout in ms. MUST exceed ÆLLI's inner LLM timeout (`AELLI_LLM_TIMEOUT_MS`,
   * default 90s) or a valid slow `decide` is aborted client-side before the brain can answer
   * or emit its own timeout error. Default 120s (= inner 90s + overhead). Env override:
   * `OCTOWIZ_AELLI_TIMEOUT_MS`.
   */
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
 * (its `handle()` returns `{ text }`, double-encoded into the part). Unwrap ONLY that exact
 * wrapper — a JSON object whose SOLE key is a non-empty string `text`. Anything else (a plain
 * string, or a richer JSON recommendation like `{"text":"…","why":"…"}`) is returned verbatim
 * so we never silently drop fields the caller may need.
 */
function unwrapArtifactText(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('{')) {
    try {
      const inner = JSON.parse(t) as Record<string, unknown>
      const keys = Object.keys(inner)
      if (keys.length === 1 && keys[0] === 'text' && typeof inner.text === 'string' && inner.text.trim() !== '')
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
  const r = c.result
  let raw = (r && typeof r === 'object')
    ? (partsText(r.artifacts?.[0]?.parts) ?? partsText(r.parts))
    : undefined
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
 * The gateway emits ONE benign trailing chunk after a completed result: a JSON-RPC error with
 * code -32603 and an `Expecting value` message (it tries to `json.loads` the SSE terminator).
 * That — and ONLY that exact shape — is ignorable. Every other error chunk is real.
 */
function isBenignTrailingError(err: { code?: unknown, message?: unknown }): boolean {
  const msg = typeof err.message === 'string' ? err.message : ''
  return err.code === -32603 && /Expecting value/i.test(msg)
}

/**
 * Parse the gateway's `message/stream` reply (NDJSON: one JSON-RPC chunk per line) into the
 * recommendation. Fails LOUD on anything suspicious so a bad stream can never look like success:
 *
 * - A **real error chunk** (anything but the exact benign trailer above) THROWS — even if a
 *   recommendation was already seen, so a `result` followed by `{error: rate-limit}` does NOT
 *   return the stale recommendation as success.
 * - A **malformed** (non-empty, non-`[DONE]`) line THROWS — a truncated/corrupted stream is a
 *   failure, not a silent skip.
 * - A `completed` result is authoritative; a non-completed/progress frame never overwrites it.
 *
 * Empty lines, `[DONE]`, an optional `data:` SSE prefix, and the benign trailer are skipped.
 * Returns the recommendation, or undefined if the stream carried none (caller fails closed).
 */
export function extractRecommendation(body: string): string | undefined {
  let terminal: string | undefined // recommendation from a `completed` result (authoritative)
  let provisional: string | undefined // from a non-completed result, until a completed one arrives
  for (const rawLine of body.split(/\r?\n/)) {
    let payload = rawLine.trim()
    if (payload === '' || payload === '[DONE]')
      continue
    if (payload.startsWith('data:')) {
      payload = payload.slice(5).trim()
      if (payload === '' || payload === '[DONE]')
        continue
    }
    let chunk: { error?: { code?: unknown, message?: unknown }, result?: { status?: { state?: unknown } } } & Record<string, unknown>
    try {
      chunk = JSON.parse(payload) as typeof chunk
    }
    catch {
      throw new Error(`ÆLLI A2A stream had a malformed chunk: ${payload.slice(0, 160)}`)
    }
    if (chunk && typeof chunk === 'object' && chunk.error && typeof chunk.error === 'object') {
      if (isBenignTrailingError(chunk.error))
        continue
      const m = typeof chunk.error.message === 'string' ? chunk.error.message : JSON.stringify(chunk.error)
      throw new Error(`ÆLLI A2A stream error: ${m}`)
    }
    const rec = chunkRecommendation(chunk)
    if (rec !== undefined) {
      const completed = chunk.result?.status?.state === 'completed'
      if (completed)
        terminal = rec
      else if (terminal === undefined)
        provisional = rec
    }
  }
  return terminal ?? provisional
}

/**
 * Build the real `AelliClient`: stream an escalation to ÆLLI's orchestrator and return its
 * recommendation. The orchestrator's `parseEvent` does `JSON.parse(parts[0].text)` and reads
 * `{ query, context }`, so the question + the structured `AelliEscalationRequest` travel as a
 * JSON-stringified **event** (NOT a plain string — a plain string fails `JSON.parse` → 400).
 * `metadata` carries the octowiz tag so the octowiz system prompt is injected server-side.
 *
 * Uses `message/stream` by default to dodge the gateway's `message/send` SSE-parse bug
 * (llm_custom #23). The outer timeout defaults to 120s (> ÆLLI's 90s inner LLM timeout) so a
 * slow-but-valid `decide` is not aborted client-side first.
 *
 * Fails closed: a non-2xx, a real stream error, a malformed stream, or no recommendation all
 * throw, so a lost recommendation never looks like success.
 */
export function createA2aAelliClient(config: A2aClientConfig): AelliClient {
  const fetchImpl = config.fetchImpl ?? fetch
  const newId = config.newId ?? randomUUID
  const timeoutMs = config.timeoutMs ?? (Number(process.env.OCTOWIZ_AELLI_TIMEOUT_MS) || 120_000)
  const transport = config.transport ?? (process.env.OCTOWIZ_A2A_TRANSPORT === 'send' ? 'send' : 'stream')
  const method = transport === 'send' ? 'message/send' : 'message/stream'
  const agentName = config.agentName ?? 'aelli-orchestrator'
  const url = `${config.baseUrl.replace(/\/$/, '')}/a2a/${agentName}`

  return async (request: AelliEscalationRequest): Promise<string> => {
    const query = `Task "${request.task.title}" needs a decision: ${request.reason ?? 'no reason given'}`
    const event = { query, context: request }
    const payload = {
      jsonrpc: '2.0',
      method,
      id: newId(),
      params: {
        message: {
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
