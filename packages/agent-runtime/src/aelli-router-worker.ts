import type { AgentWorker } from './index'
import { randomUUID } from 'node:crypto'

/**
 * Config for the real model worker: route implement/review work through ÆLLI's deployed
 * router (`aelli-router:workflow`) instead of the missing local `octowiz-model` binary.
 * The router runs generate -> review -> revise with built-in no-self-approval (a coding
 * model writes, a separate reviewer model reviews), so the no-self-review doctrine is
 * enforced upstream rather than reimplemented here.
 */
export interface AelliRouterWorkerConfig {
  /** ÆLLI A2A base, e.g. `https://llm.integrahub.de`. The `/a2a/aelli-router` path is appended. */
  baseUrl: string
  /** LiteLLM-gateway bearer token (`LITELLM_API_KEY`). */
  apiKey: string
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Injectable id generator; defaults to `randomUUID`. */
  newId?: () => string
  /** Request timeout in ms. The workflow runs multiple model calls, so default 10 min. */
  timeoutMs?: number
}

interface RouterResult {
  output?: unknown
  verdict?: unknown
  error?: unknown
}

/**
 * The A2A endpoint streams Server-Sent Events: `data: <json>` lines terminated by
 * `data: [DONE]`. Each line's payload is the skill's own object, emitted directly (NOT
 * wrapped in JSON-RPC `result.artifacts`). For a workflow the stream is the phase events
 * followed by the final result; we want the last payload carrying `output`/`verdict`.
 */
export function parseRouterResult(body: string): RouterResult {
  let last: RouterResult | undefined
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:'))
      continue
    const payload = line.slice(5).trim()
    if (payload === '' || payload === '[DONE]')
      continue
    let obj: RouterResult
    try {
      obj = JSON.parse(payload) as RouterResult
    }
    catch {
      continue
    }
    // Keep the terminal result (has output/verdict/error); ignore intermediate phase events.
    if (obj.output !== undefined || obj.verdict !== undefined || obj.error !== undefined)
      last = obj
  }
  if (last === undefined)
    throw new Error('ÆLLI router stream had no result payload (output/verdict/error)')
  return last
}

/**
 * Build the real `AgentWorker`: send the role-tagged prompt to `aelli-router:workflow` as
 * an A2A `message/send`, parse the SSE result, and return the generated/revised code.
 *
 * Fails closed, mirroring `aelli-adapter`'s A2A client: a non-2xx, a workflow `error`, or
 * an empty `output` all throw, so a missing result never looks like a successful dispatch.
 */
export function createAelliRouterWorker(config: AelliRouterWorkerConfig): AgentWorker {
  const fetchImpl = config.fetchImpl ?? fetch
  const newId = config.newId ?? randomUUID
  const timeoutMs = config.timeoutMs ?? 600_000
  const url = `${config.baseUrl.replace(/\/$/, '')}/a2a/aelli-router`

  return async ({ role, prompt }) => {
    // taskKind carries the octowiz role; the router classifies tier/workflow from content.
    const event = { type: 'workflow', content: prompt, taskKind: role }
    const payload = {
      jsonrpc: '2.0',
      method: 'message/send',
      id: newId(),
      params: {
        message: {
          parts: [{ kind: 'text', text: JSON.stringify(event) }],
          metadata: {
            capability: 'aelli-router:workflow',
            source: 'octowiz-v2',
            octowiz_doctrine: 'v1',
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
      throw new Error(`ÆLLI router call failed: ${res.status} ${res.statusText}`)

    const result = parseRouterResult(await res.text())
    if (result.error !== undefined)
      throw new Error(`ÆLLI router workflow error: ${typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}`)

    const output = result.output
    if (typeof output !== 'string' || output.trim() === '')
      throw new Error(`ÆLLI router workflow produced no output (verdict=${String(result.verdict)})`)

    return { text: output }
  }
}
