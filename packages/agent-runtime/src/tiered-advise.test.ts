import type { LedgerStore } from '@octowiz/room-ledger'
import type { LedgerEvent } from '@octowiz/schemas'
import type { AgentWorker } from './index'
import type { AdviceReviewer } from './tiered-advise'
import { RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it } from 'vitest'
import { tieredAdvise } from './tiered-advise'

const at = '2026-06-22T00:00:00.000Z'

function memoryStore(): LedgerStore {
  const logs = new Map<string, LedgerEvent[]>()
  return {
    async appendEvent(roomId, event) {
      const events = logs.get(roomId) ?? []
      events.push(event)
      logs.set(roomId, events)
    },
    async readEvents(roomId) {
      return [...(logs.get(roomId) ?? [])]
    },
    async listRooms() {
      return [...logs.keys()]
    },
  }
}

async function seed(): Promise<RoomLedger> {
  const ledger = new RoomLedger(memoryStore())
  await ledger.createRoom({ id: 'r1', name: 'Room', status: 'active', createdAt: at }, at)
  await ledger.addParticipant('r1', { id: 'rev', kind: 'agent', roles: ['reviewer'], displayName: 'Reviewer' }, at)
  await ledger.createTask({ id: 't1', roomId: 'r1', title: 'Task', status: 'open' }, at)
  return ledger
}

function workerFactory(dispatched: string[]): (modelId: string) => AgentWorker {
  return modelId => async ({ prompt: _prompt }) => {
    dispatched.push(modelId)
    return { text: `${modelId} says: do the thing` }
  }
}

const baseArgs = {
  roomId: 'r1',
  taskId: 't1',
  advisorId: 'adv',
  reviewerId: 'rev',
  prompt: 'how do I X?',
  tiers: ['cheap', 'expensive'],
  at,
}

describe('tieredAdvise', () => {
  it('returns the cheap recommendation and never dispatches the expensive tier when cheap is approved', async () => {
    const ledger = await seed()
    const dispatched: string[] = []
    const review: AdviceReviewer = async () => 'approved'
    const result = await tieredAdvise(baseArgs, { ledger, gatewayWorker: workerFactory(dispatched), review })
    expect(result).toEqual({ status: 'approved', recommendation: 'cheap says: do the thing', tier: 'cheap' })
    expect(dispatched).toEqual(['cheap'])
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(1)
    expect(state?.escalations).toHaveLength(0)
  })

  it('escalates to the expensive tier when cheap is rejected, then approves', async () => {
    const ledger = await seed()
    const dispatched: string[] = []
    let calls = 0
    const review: AdviceReviewer = async () => (calls++ === 0 ? 'rejected' : 'approved')
    const result = await tieredAdvise(baseArgs, { ledger, gatewayWorker: workerFactory(dispatched), review })
    expect(result).toEqual({ status: 'approved', recommendation: 'expensive says: do the thing', tier: 'expensive' })
    expect(dispatched).toEqual(['cheap', 'expensive'])
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(1)
    expect(state?.advice[0]?.tier).toBe('expensive')
  })

  it('records an escalation with the last recommendation when all tiers are rejected', async () => {
    const ledger = await seed()
    const dispatched: string[] = []
    const review: AdviceReviewer = async () => 'rejected'
    const result = await tieredAdvise(baseArgs, { ledger, gatewayWorker: workerFactory(dispatched), review })
    expect(result).toEqual({ status: 'escalated', recommendation: 'expensive says: do the thing' })
    expect(dispatched).toEqual(['cheap', 'expensive'])
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(0)
    expect(state?.escalations).toHaveLength(1)
    expect(state?.escalations[0]?.reason).toMatch(/all advisor tiers rejected/)
    expect(state?.escalations[0]?.recommendation).toBe('expensive says: do the thing')
  })

  it('throws when the reviewer is the advisor (no self-review), recording nothing', async () => {
    const ledger = await seed()
    const dispatched: string[] = []
    const review: AdviceReviewer = async () => 'approved'
    await expect(tieredAdvise(
      { ...baseArgs, reviewerId: 'adv' },
      { ledger, gatewayWorker: workerFactory(dispatched), review },
    )).rejects.toThrow(/no self-review/)
    expect(dispatched).toEqual([])
  })

  it('propagates a gateway failure and records nothing', async () => {
    const ledger = await seed()
    const review: AdviceReviewer = async () => 'approved'
    const gatewayWorker = (): AgentWorker => async () => {
      throw new Error('gateway down')
    }
    await expect(tieredAdvise(baseArgs, { ledger, gatewayWorker, review })).rejects.toThrow(/gateway down/)
    const state = await ledger.getState('r1')
    expect(state?.advice).toHaveLength(0)
    expect(state?.escalations).toHaveLength(0)
  })
})
