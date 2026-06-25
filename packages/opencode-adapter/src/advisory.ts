import type { RecordAction } from './action-stream'
import process from 'node:process'

/**
 * Injected ÆLLI advisory seam. The composition root adapts the real
 * `createA2aAelliClient` (packages/aelli-adapter) to THIS shape so this package
 * keeps zero cross-package runtime deps (same discipline as `RecordAction`).
 *
 * Returns the recommendation string, or rejects on error/timeout.
 */
export type AelliAdvisor = (context: { tool: string, args: Record<string, unknown> }) => Promise<string>

export interface AdvisoryOptions {
  taskId?: string
  /** Short bound (ms) for the advisory race. Defaults via `resolveAdvisoryTimeoutMs`. */
  timeoutMs?: number
  /** Surface an advisory/ledger failure without aborting the session. Defaults to console.error. */
  onError?: (err: unknown) => void
}

/** Default advisory bound. Short on purpose so a slow/down ÆLLI never stalls the coding session. */
const DEFAULT_ADVISORY_TIMEOUT_MS = 1500

/** Max chars persisted for the recommendation summary; keeps the ledger entry small. */
const MAX_SUMMARY_LEN = 500

/**
 * Distinct sentinel so the race can tell "timed out" (record nothing) apart from
 * "advisor returned" (possibly empty). A unique symbol can never collide with a
 * recommendation string.
 */
const TIMED_OUT = Symbol('aelli-advisory-timeout')

/**
 * Resolve the advisory bound from `OCTOWIZ_AELLI_ADVISORY_TIMEOUT_MS`. Only a finite,
 * strictly positive value is honored; NaN / <= 0 fall back to the default so a bad env
 * can never remove the bound (and stall the session). Mirrors `resolveTimeoutMs` in
 * a2a-client.ts — but with a SHORT default; the 120s escalation bound would stall a
 * coding session.
 */
export function resolveAdvisoryTimeoutMs(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ADVISORY_TIMEOUT_MS
}

/**
 * Consult ÆLLI for an advisory before a tool runs, record a REAL answer via
 * `recordAction`, and ALWAYS resolve so the caller proceeds with the tool.
 *
 * ADVISORY ONLY — never blocks/vetoes. Fail-open in every direction:
 * - Bounded by `Promise.race` against a short timer; on timeout the advisor is
 *   abandoned and NOTHING is recorded (no stale success).
 * - Records ONLY a genuine, non-empty recommendation returned within the bound.
 * - NEVER throws — advisor reject, timeout, empty answer, and a `recordAction`
 *   rejection are all swallowed and surfaced via `onError` (default console.error).
 * - A late advisor rejection AFTER timeout can't become an unhandled rejection:
 *   the advisor promise has a `.catch` attached before the race.
 */
export async function adviseBeforeTool(
  advisor: AelliAdvisor,
  recordAction: RecordAction,
  context: { tool: string, args: Record<string, unknown> },
  opts: AdvisoryOptions = {},
): Promise<void> {
  const onError = opts.onError ?? ((err: unknown) => console.error('[opencode-adapter] aelli advisory failed:', err))
  const timeoutMs = opts.timeoutMs ?? resolveAdvisoryTimeoutMs(process.env.OCTOWIZ_AELLI_ADVISORY_TIMEOUT_MS)

  // Start the advisory. Attach a .catch up front so a late rejection (e.g. after we
  // have already raced to the timeout sentinel) can never surface as an unhandled
  // rejection. The caught value is re-thrown into the race via a rejecting wrapper.
  let advisorError: unknown
  let advisorRejected = false
  const advisorPromise = advisor(context).catch((err: unknown) => {
    advisorRejected = true
    advisorError = err
    return TIMED_OUT as never // resolve the race to a non-record outcome
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(resolve, timeoutMs, TIMED_OUT)
  })

  let outcome: string | typeof TIMED_OUT
  try {
    outcome = await Promise.race([advisorPromise, timeoutPromise])
  }
  finally {
    if (timer !== undefined)
      clearTimeout(timer)
  }

  // Advisor rejected (within or after bound) → fail-open, surface, record nothing.
  if (advisorRejected) {
    onError(advisorError)
    return
  }

  // Timed out → abandon, record nothing (no stale success).
  if (outcome === TIMED_OUT)
    return

  // Empty/whitespace recommendation → not a genuine answer, record nothing.
  const recommendation = outcome.trim()
  if (recommendation === '')
    return

  const action: { tool: string, summary: string, taskId?: string } = {
    tool: 'aelli.advisory',
    summary: recommendation.slice(0, MAX_SUMMARY_LEN),
  }
  if (opts.taskId !== undefined)
    action.taskId = opts.taskId

  // Recording is best-effort: a ledger hiccup must not abort the tool.
  try {
    await recordAction(action)
  }
  catch (err) {
    onError(err)
  }
}
