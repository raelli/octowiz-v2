import type { RoomLedger } from '@octowiz/room-ledger'
import type { ReviewVerdict } from '@octowiz/schemas'
import type { AgentWorker } from './index'
import { canReview } from '@octowiz/doctrine'

export interface AdviceReviewInput {
  taskId: string
  prompt: string
  candidate: string
}

export type AdviceReviewer = (input: AdviceReviewInput) => Promise<ReviewVerdict>

export interface TieredAdviseDeps {
  ledger: RoomLedger
  gatewayWorker: (modelId: string) => AgentWorker
  review: AdviceReviewer
}

export interface TieredAdviseArgs {
  roomId: string
  taskId: string
  advisorId: string
  reviewerId: string
  prompt: string
  tiers: string[]
  at: string
}

export type TieredAdviseResult = { status: 'approved', recommendation: string, tier: string } | { status: 'escalated', recommendation: string }

/**
 * Walk advisor tiers in order. Record approved advice at the first approved tier,
 * otherwise escalate after all tiers are rejected.
 */
export async function tieredAdvise(args: TieredAdviseArgs, deps: TieredAdviseDeps): Promise<TieredAdviseResult> {
  const { roomId, taskId, advisorId, reviewerId, prompt, tiers, at } = args
  const { ledger, gatewayWorker, review } = deps

  if (tiers.length === 0)
    throw new Error('tieredAdvise requires at least one tier')
  if (reviewerId === advisorId)
    throw new Error(`reviewer \"${reviewerId}\" may not review advisor \"${advisorId}\" (no self-review)`)

  const state = await ledger.getState(roomId)
  if (state === null)
    throw new Error(`room \"${roomId}\" has no state`)
  if (!canReview(state, taskId, reviewerId))
    throw new Error(`\"${reviewerId}\" may not review task \"${taskId}\" (no self-review)`)

  let lastText = ''
  for (const tier of tiers) {
    const out = await gatewayWorker(tier)({ role: 'advisor', prompt })
    lastText = out.text
    const verdict = await review({ taskId, prompt, candidate: out.text })
    if (verdict === 'approved') {
      await ledger.recordAdvice(
        roomId,
        {
          id: `adv-${roomId}-${taskId}-${tier}-${at}`,
          roomId,
          taskId,
          advisorId,
          reviewerId,
          tier,
          recommendation: out.text,
          verdict: 'approved',
          createdAt: at,
        },
        at,
      )
      return { status: 'approved', recommendation: out.text, tier }
    }
  }

  await ledger.recordEscalation(
    roomId,
    {
      id: `esc-${roomId}-${taskId}-${at}`,
      roomId,
      taskId,
      reason: 'all advisor tiers rejected by review',
      recommendation: lastText,
      createdAt: at,
    },
    at,
  )
  return { status: 'escalated', recommendation: lastText }
}
