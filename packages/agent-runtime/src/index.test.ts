import type { LedgerStore } from '@octowiz/room-ledger'
import type { LedgerEvent, Participant } from '@octowiz/schemas'
import type { AgentWorker } from './index'
import { RoomLedger } from '@octowiz/room-ledger'
import { ParticipantRoleSchema } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { AGENT_ROLES, assignRole, dispatch } from './index'

// In-memory store keeps the dispatch tests pure — no tmpdir, no filesystem. It mirrors
// FileLedgerStore's append/read contract closely enough to drive RoomLedger end to end.
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

const baseAgent: Participant = {
  id: 'a1',
  kind: 'agent',
  roles: [],
  displayName: 'Agent One',
}

describe('aGENT_ROLES', () => {
  it('is exactly the four assignable agent roles', () => {
    expect([...AGENT_ROLES]).toEqual(['implementer', 'reviewer', 'validator', 'advisor'])
  })

  it('is consumed from the schema vocabulary, not redefined', () => {
    // Every agent role is a real schema role; the non-agent steward role is excluded.
    expect(ParticipantRoleSchema.options).toEqual(expect.arrayContaining([...AGENT_ROLES]))
    expect([...AGENT_ROLES]).not.toContain('steward')
  })
})

describe('assignRole', () => {
  it.each(AGENT_ROLES)('tags a participant with the %s role', (role) => {
    const assigned = assignRole(baseAgent, role)
    expect(assigned.roles).toContain(role)
  })

  it('does not mutate the input participant', () => {
    assignRole(baseAgent, 'reviewer')
    expect(baseAgent.roles).toEqual([])
  })

  it('does not duplicate a role already held', () => {
    const reviewer = assignRole(baseAgent, 'reviewer')
    const again = assignRole(reviewer, 'reviewer')
    expect(again.roles).toEqual(['reviewer'])
  })

  it('accumulates multiple distinct roles', () => {
    const both = assignRole(assignRole(baseAgent, 'implementer'), 'reviewer')
    expect(both.roles).toEqual(['implementer', 'reviewer'])
  })

  it('rejects the steward role (not an agent role)', () => {
    // steward is in the schema enum but is not one of the four agent roles.
    expect(() => assignRole(baseAgent, 'steward' as never)).toThrow(/steward/)
  })

  it('rejects an unknown role', () => {
    expect(() => assignRole(baseAgent, 'wizard' as never)).toThrow()
  })
})

async function seedRoom(): Promise<{ ledger: RoomLedger, advisor: Participant }> {
  const ledger = new RoomLedger(memoryStore())
  const at = '2026-06-21T00:00:00.000Z'
  await ledger.createRoom({ id: 'r1', name: 'Room One', status: 'active', createdAt: at }, at)
  const advisor = assignRole({ id: 'adv', kind: 'agent', roles: [], displayName: 'Advisor' }, 'advisor')
  await ledger.addParticipant('r1', advisor, at)
  await ledger.createTask({ id: 't1', roomId: 'r1', title: 'Task One', status: 'open' }, at)
  return { ledger, advisor }
}

describe('dispatch', () => {
  it('runs the injected worker and records its output to the ledger', async () => {
    const { ledger, advisor } = await seedRoom()
    const calls: string[] = []
    const worker: AgentWorker = async (input) => {
      calls.push(input.prompt)
      return { text: 'escalate: model is unsure about the API contract' }
    }

    const state = await dispatch({
      ledger,
      worker,
      roomId: 'r1',
      participant: advisor,
      taskId: 't1',
      prompt: 'should we change the contract?',
      at: '2026-06-21T01:00:00.000Z',
    })

    // The worker seam was actually exercised with the caller's prompt.
    expect(calls).toEqual(['should we change the contract?'])
    // The output is visible in the projected room state.
    expect(state.escalations).toHaveLength(1)
    expect(state.escalations[0]?.reason).toBe('escalate: model is unsure about the API contract')
    expect(state.escalations[0]?.taskId).toBe('t1')
    expect(state.escalations[0]?.roomId).toBe('r1')
  })

  it('persists the recorded output so a re-projection still shows it', async () => {
    const { ledger, advisor } = await seedRoom()
    const worker: AgentWorker = async () => ({ text: 'needs human input' })
    await dispatch({
      ledger,
      worker,
      roomId: 'r1',
      participant: advisor,
      taskId: 't1',
      prompt: 'help',
      at: '2026-06-21T01:00:00.000Z',
    })

    const state = await ledger.getState('r1')
    expect(state?.escalations.map(e => e.reason)).toEqual(['needs human input'])
  })

  it('refuses to dispatch a participant that does not hold the advisor role', async () => {
    const { ledger } = await seedRoom()
    const worker: AgentWorker = async () => ({ text: 'x' })
    const implementer = assignRole({ id: 'imp', kind: 'agent', roles: [], displayName: 'Imp' }, 'implementer')
    await expect(
      dispatch({
        ledger,
        worker,
        roomId: 'r1',
        participant: implementer,
        taskId: 't1',
        prompt: 'p',
        at: '2026-06-21T01:00:00.000Z',
      }),
    ).rejects.toThrow(/advisor/)
  })
})
