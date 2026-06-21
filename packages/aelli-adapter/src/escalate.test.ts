import type { LedgerStore } from '@octowiz/room-ledger'
import type { LedgerEvent } from '@octowiz/schemas'
import type { AelliClient } from './index'
import { RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it } from 'vitest'
import { buildEscalationRequest, recordAelliEscalation } from './index'

/**
 * In-memory LedgerStore fake — keeps this a pure unit test (no fs, no @types/node).
 * The interface is three methods; that's all `RoomLedger` consumes.
 */
class MemoryLedgerStore implements LedgerStore {
  private readonly logs = new Map<string, LedgerEvent[]>()

  async appendEvent(roomId: string, event: LedgerEvent): Promise<void> {
    const log = this.logs.get(roomId) ?? []
    log.push(event)
    this.logs.set(roomId, log)
  }

  async readEvents(roomId: string): Promise<LedgerEvent[]> {
    return [...(this.logs.get(roomId) ?? [])]
  }

  async listRooms(): Promise<string[]> {
    return [...this.logs.keys()]
  }
}

/** Seed a room with one assigned, failing-validation task and return a ledger ready to escalate. */
async function seededLedger(): Promise<RoomLedger> {
  const ledger = new RoomLedger(new MemoryLedgerStore())
  await ledger.createRoom({ id: 'r1', name: 'Room One', status: 'active', createdAt: 't0' }, 't0')
  await ledger.addParticipant('r1', { id: 'impl', kind: 'agent', roles: ['implementer'], displayName: 'Impl' }, 't1')
  await ledger.createTask({ id: 'tk1', roomId: 'r1', title: 'Do it', status: 'in_review', implementerId: 'impl' }, 't2')
  await ledger.recordValidation('r1', { id: 'v1', taskId: 'tk1', status: 'failed', checks: [{ name: 'lint', status: 'failed' }], createdAt: 't3' }, 't3')
  return ledger
}

describe('recordAelliEscalation', () => {
  it('asks the injected ÆLLI seam and records its recommendation as an escalation visible in projected state', async () => {
    const ledger = await seededLedger()
    const state = await ledger.getState('r1')
    const request = buildEscalationRequest(state!, 'tk1')

    // Fake ÆLLI: no network, just returns a recommendation derived from the request.
    const askAelli: AelliClient = async req => `for "${req.task.title}": rerun the failing checks`

    const projected = await recordAelliEscalation(ledger, askAelli, request, { id: 'esc1', at: 't4' })

    expect(projected.escalations).toHaveLength(1)
    const escalation = projected.escalations.at(0)
    expect(escalation).toMatchObject({
      id: 'esc1',
      roomId: 'r1',
      taskId: 'tk1',
      reason: 'latest validation failed',
      recommendation: 'for "Do it": rerun the failing checks',
      createdAt: 't4',
    })

    // Observable on a fresh projection too — it was persisted, not just returned.
    const reloaded = await ledger.getState('r1')
    expect(reloaded!.escalations).toHaveLength(1)
    expect(reloaded!.escalations.at(0)?.recommendation).toBe('for "Do it": rerun the failing checks')
  })

  it('passes the request payload to the seam', async () => {
    const ledger = await seededLedger()
    const request = buildEscalationRequest((await ledger.getState('r1'))!, 'tk1')

    let seen: typeof request | undefined
    const askAelli: AelliClient = async (req) => {
      seen = req
      return 'ok'
    }

    await recordAelliEscalation(ledger, askAelli, request, { id: 'esc1', at: 't4' })
    expect(seen).toEqual(request)
  })

  it('propagates a seam error and records nothing (the ledger stays clean)', async () => {
    const ledger = await seededLedger()
    const request = buildEscalationRequest((await ledger.getState('r1'))!, 'tk1')

    const askAelli: AelliClient = async () => {
      throw new Error('ÆLLI unavailable')
    }

    await expect(recordAelliEscalation(ledger, askAelli, request, { id: 'esc1', at: 't4' }))
      .rejects
      .toThrow(/unavailable/)

    const state = await ledger.getState('r1')
    expect(state!.escalations).toEqual([])
  })

  it('throws when the request carries no reason (no trigger fired — recording an escalation would be a caller bug)', async () => {
    const ledger = await seededLedger()
    // A request with no reason: a healthy task that did not trigger escalation.
    const request = { ...buildEscalationRequest((await ledger.getState('r1'))!, 'tk1'), reason: undefined }

    const askAelli: AelliClient = async () => 'ok'

    await expect(recordAelliEscalation(ledger, askAelli, request, { id: 'esc1', at: 't4' }))
      .rejects
      .toThrow(/reason/)
  })
})
