import type { Event, ToolPart } from '@opencode-ai/sdk'

/**
 * Normalized seam: a completed tool invocation, stripped of SDK shapes.
 * `streamActionsToLedger` consumes a stream of these and never touches the SDK,
 * which keeps the recording loop pure and trivially fakeable in unit tests.
 */
export interface ToolEvent {
  tool: string
  summary: string
  callID: string
}

/**
 * Ledger seam. We deliberately do NOT import `@octowiz/room-ledger` for a type:
 * this package stays free of cross-package deps (same discipline as avoiding a
 * dependency on zellij-adapter). This mirrors `RoomLedger.recordAction(roomId,
 * tool, summary, at, taskId?)` curried/bound at the composition root, so the
 * adapter only sees a minimal write function.
 */
export type RecordAction = (action: { tool: string, summary: string, taskId?: string }) => Promise<void>

export interface StreamActionsOptions {
  taskId?: string
  /** Surface a ledger-write failure without aborting the session. Defaults to console.error. */
  onError?: (err: unknown, event: ToolEvent) => void
}

/**
 * Consume a stream of completed tool events, recording each once via `recordAction`.
 *
 * Observation is a SIDE-CHANNEL, not a gate: a `recordAction` rejection MUST NOT
 * stop the loop. We catch it, surface it via `onError` (default: console.error),
 * and continue so the remaining tool events are still recorded and the underlying
 * session is never aborted by a ledger hiccup.
 *
 * Dedupe is the producer's responsibility: this loop assumes the incoming stream
 * already yields one event per completed call (see `toToolEvent` + the dedupe in
 * `subscribeToolEvents`). It records exactly what it is given.
 */
export async function streamActionsToLedger(
  events: AsyncIterable<ToolEvent>,
  recordAction: RecordAction,
  opts: StreamActionsOptions = {},
): Promise<void> {
  const onError = opts.onError ?? ((err: unknown) => console.error('[opencode-adapter] ledger write failed:', err))

  for await (const event of events) {
    const action: { tool: string, summary: string, taskId?: string } = {
      tool: event.tool,
      summary: event.summary,
    }
    if (opts.taskId !== undefined)
      action.taskId = opts.taskId

    try {
      await recordAction(action)
    }
    catch (err) {
      onError(err, event)
    }
  }
}

// The ledger is plaintext and long-lived, so summaries must never carry
// credentials verbatim. Two layers: secret-named keys are redacted wholesale,
// and string values are scrubbed for credential-shaped substrings (auth
// headers, NAME=value env assignments, well-known key prefixes).
// ponytail: high-signal patterns only, not a secret scanner — entropy-based
// detection can come from a real secretlint pass if leaks still slip through.
const SECRET_KEY = /(?:token|secret|password|passwd|credential|api[-_]?key|authorization)$/i
const ENV_ASSIGNMENT = /(\w*(?:token|secret|password|passwd|api[-_]?key|credential)\w*)=\S+/gi
const CREDENTIAL_SHAPES = [
  /\bBearer\s+[\w.~+/=-]+/gi, // Authorization header values
  /\bsk-[\w-]{8,}/g, // OpenAI/Anthropic/Stripe-style
  /\bgh[pousr]_[A-Z0-9]{16,}/gi, // GitHub tokens
  /\bgithub_pat_\w{20,}/g,
  /\bxox[baprs]-[\w-]{4,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
]

function scrubString(value: string): string {
  const envScrubbed = value.replace(ENV_ASSIGNMENT, '$1=[redacted]')
  return CREDENTIAL_SHAPES.reduce((acc, shape) => acc.replace(shape, '[redacted]'), envScrubbed)
}

function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string')
    return scrubString(value)
  if (Array.isArray(value))
    return value.map(redactSecrets)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) =>
      SECRET_KEY.test(key) ? [key, '[redacted]'] : [key, redactSecrets(nested)]))
  }
  return value
}

/**
 * Deterministic, pure summary of a tool's input: compact JSON with secrets
 * redacted, truncated to keep the ledger entry small. Tested directly.
 */
export function summariseToolInput(input: Record<string, unknown>): string {
  return JSON.stringify(redactSecrets(input)).slice(0, 200)
}

/**
 * Pure SDK-shape filter + normaliser. Maps a single SDK `Event` to a `ToolEvent`
 * iff it is a completed tool execution, else `undefined`.
 *
 * SDK MAPPING NOTE: issue #86 speaks of "tool.execute.after" (plugin-API wording).
 * The installed @opencode-ai/sdk 1.17.x has no such event. A completed tool call
 * instead surfaces as `message.part.updated` whose `part.type === 'tool'` and
 * `part.state.status === 'completed'`. The same call emits multiple part-updated
 * events as it transitions pending→running→completed, so callers must dedupe by
 * `callID` (done in `subscribeToolEvents`); here we only emit on the completed
 * transition and drop pending/running/error.
 */
export function toToolEvent(event: Event): ToolEvent | undefined {
  if (event.type !== 'message.part.updated')
    return undefined
  const part = event.properties.part
  if (part.type !== 'tool')
    return undefined
  const toolPart = part as ToolPart
  if (toolPart.state.status !== 'completed')
    return undefined
  return {
    tool: toolPart.tool,
    summary: summariseToolInput(toolPart.state.input),
    callID: toolPart.callID,
  }
}

// ── Production wiring (NOT exercised by unit tests; touches the real SDK stream) ──

/**
 * Map the real `client.event.subscribe()` SSE stream into a deduped
 * `AsyncIterable<ToolEvent>` of completed tool executions.
 *
 * `eventStream` is the SDK's async iterable of `Event` (e.g. the `.stream` of the
 * `ServerSentEventsResult` returned by `client.event.subscribe()`). We filter via
 * the pure `toToolEvent` helper and dedupe by `callID` so each tool call is
 * recorded exactly once despite multiple state-transition emissions.
 *
 * Clearly marked production wiring: kept here, no SDK runtime import needed
 * because the caller hands us the already-subscribed stream.
 */
export async function* subscribeToolEvents(eventStream: AsyncIterable<Event>): AsyncIterable<ToolEvent> {
  const seen = new Set<string>()
  for await (const event of eventStream) {
    const toolEvent = toToolEvent(event)
    if (!toolEvent || seen.has(toolEvent.callID))
      continue
    seen.add(toolEvent.callID)
    yield toolEvent
  }
}
