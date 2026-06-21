import type { LedgerStore } from '@octowiz/room-ledger'
import type { LedgerEvent, Participant } from '@octowiz/schemas'
import type { AgentWorker, EscalationHandoff, Run } from './index'
import { RoomLedger } from '@octowiz/room-ledger'
import { ParticipantRoleSchema } from '@octowiz/schemas'
import { describe, expect, it } from 'vitest'
import { AGENT_ROLES, assignRole, createLocalModelWorker, dispatch, dispatchReview, handoffEscalation } from './index'

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
    expect([...AGENT_ROLES]).toHaveLength(4)
    expect([...AGENT_ROLES]).toEqual(
      expect.arrayContaining(['implementer', 'reviewer', 'validator', 'advisor']),
    )
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

// Seed a room with a task whose implementer is a participant, plus a separate reviewer.
async function seedReviewRoom(): Promise<{
  ledger: RoomLedger
  reviewer: Participant
  implementer: Participant
}> {
  const ledger = new RoomLedger(memoryStore())
  const at = '2026-06-21T00:00:00.000Z'
  await ledger.createRoom({ id: 'r1', name: 'Room One', status: 'active', createdAt: at }, at)
  // The implementer also holds the reviewer role, so self-review can only be stopped by the
  // no-self-review (implementer-id) rule, not by a missing reviewer role.
  const implementer = assignRole(
    assignRole({ id: 'imp', kind: 'agent', roles: [], displayName: 'Implementer' }, 'implementer'),
    'reviewer',
  )
  const reviewer = assignRole({ id: 'rev', kind: 'agent', roles: [], displayName: 'Reviewer' }, 'reviewer')
  await ledger.addParticipant('r1', implementer, at)
  await ledger.addParticipant('r1', reviewer, at)
  await ledger.createTask({ id: 't1', roomId: 'r1', title: 'Task One', status: 'open', implementerId: 'imp' }, at)
  return { ledger, reviewer, implementer }
}

describe('dispatchReview', () => {
  it('refuses when the reviewer is the task implementer — no worker call, no recorded review', async () => {
    const { ledger, implementer } = await seedReviewRoom()
    const calls: string[] = []
    const worker: AgentWorker = async (input) => {
      calls.push(input.prompt)
      return { text: 'looks good' }
    }

    await expect(
      dispatchReview({
        ledger,
        worker,
        roomId: 'r1',
        participant: implementer,
        taskId: 't1',
        prompt: 'review it',
        reviewId: 'rv1',
        verdict: 'approved',
        at: '2026-06-21T01:00:00.000Z',
      }),
    ).rejects.toThrow()

    // No worker invocation and no recorded output on refusal.
    expect(calls).toEqual([])
    const state = await ledger.getState('r1')
    expect(state?.reviews).toEqual([])
  })

  it('refuses a participant who does not hold the reviewer role (canReview gate)', async () => {
    const { ledger } = await seedReviewRoom()
    // A bystander: known participant, but holds no reviewer role and is not the implementer.
    const bystander = assignRole({ id: 'by', kind: 'agent', roles: [], displayName: 'Bystander' }, 'advisor')
    await ledger.addParticipant('r1', bystander, '2026-06-21T00:30:00.000Z')
    const calls: string[] = []
    const worker: AgentWorker = async (input) => {
      calls.push(input.prompt)
      return { text: 'x' }
    }

    await expect(
      dispatchReview({
        ledger,
        worker,
        roomId: 'r1',
        participant: bystander,
        taskId: 't1',
        prompt: 'review it',
        reviewId: 'rv1',
        verdict: 'approved',
        at: '2026-06-21T01:00:00.000Z',
      }),
    ).rejects.toThrow()
    expect(calls).toEqual([])
    expect((await ledger.getState('r1'))?.reviews).toEqual([])
  })

  it('allows a qualified reviewer who is not the implementer and records the review', async () => {
    const { ledger, reviewer } = await seedReviewRoom()
    const calls: string[] = []
    const worker: AgentWorker = async (input) => {
      calls.push(input.prompt)
      return { text: 'approving: tests pass and the change is sound' }
    }

    const state = await dispatchReview({
      ledger,
      worker,
      roomId: 'r1',
      participant: reviewer,
      taskId: 't1',
      prompt: 'please review',
      reviewId: 'rv1',
      verdict: 'approved',
      at: '2026-06-21T01:00:00.000Z',
    })

    // Worker exercised as a reviewer with the caller's prompt.
    expect(calls).toEqual(['please review'])
    expect(state.reviews).toHaveLength(1)
    expect(state.reviews[0]?.reviewerId).toBe('rev')
    expect(state.reviews[0]?.taskId).toBe('t1')
    expect(state.reviews[0]?.verdict).toBe('approved')
    // The worker's text becomes the review notes.
    expect(state.reviews[0]?.notes).toBe('approving: tests pass and the change is sound')
  })

  it('throws when the room has no state', async () => {
    const ledger = new RoomLedger(memoryStore())
    const reviewer = assignRole({ id: 'rev', kind: 'agent', roles: [], displayName: 'Reviewer' }, 'reviewer')
    const worker: AgentWorker = async () => ({ text: 'x' })
    await expect(
      dispatchReview({
        ledger,
        worker,
        roomId: 'missing',
        participant: reviewer,
        taskId: 't1',
        prompt: 'p',
        reviewId: 'rv1',
        verdict: 'approved',
        at: '2026-06-21T01:00:00.000Z',
      }),
    ).rejects.toThrow()
  })
})

// Records every handoff so its call count and the request can be asserted, and returns a
// caller-supplied recommendation — the faked ÆLLI seam. No real ÆLLI client or network.
function stubHandoff(recommendation: string): {
  handoff: EscalationHandoff
  calls: { reason: string, roomId: string, taskId: string }[]
} {
  const calls: { reason: string, roomId: string, taskId: string }[] = []
  const handoff: EscalationHandoff = async (request) => {
    calls.push(request)
    return recommendation
  }
  return { handoff, calls }
}

describe('handoffEscalation', () => {
  it('hands off through the injected seam and records the escalation when the worker fails', async () => {
    const { ledger, advisor } = await seedRoom()
    const worker: AgentWorker = async () => {
      throw new Error('local model unavailable')
    }
    const { handoff, calls } = stubHandoff('retry on the remote model')

    const state = await handoffEscalation({
      ledger,
      worker,
      handoff,
      roomId: 'r1',
      participant: advisor,
      taskId: 't1',
      prompt: 'should we change the contract?',
      at: '2026-06-21T02:00:00.000Z',
    })

    // The handoff seam was exercised once, carrying the failure as the reason.
    expect(calls).toHaveLength(1)
    expect(calls[0]?.reason).toMatch(/local model unavailable/)
    expect(calls[0]?.roomId).toBe('r1')
    expect(calls[0]?.taskId).toBe('t1')
    // The escalation is visible in the projected room state, with the seam's recommendation.
    expect(state.escalations).toHaveLength(1)
    expect(state.escalations[0]?.reason).toMatch(/local model unavailable/)
    expect(state.escalations[0]?.recommendation).toBe('retry on the remote model')
    expect(state.escalations[0]?.taskId).toBe('t1')
    expect(state.escalations[0]?.roomId).toBe('r1')
  })

  it('persists the recorded escalation so a re-projection still shows it', async () => {
    const { ledger, advisor } = await seedRoom()
    const worker: AgentWorker = async () => {
      throw new Error('out of depth')
    }
    const { handoff } = stubHandoff('ask a human')

    await handoffEscalation({
      ledger,
      worker,
      handoff,
      roomId: 'r1',
      participant: advisor,
      taskId: 't1',
      prompt: 'help',
      at: '2026-06-21T02:00:00.000Z',
    })

    const state = await ledger.getState('r1')
    expect(state?.escalations.map(e => e.recommendation)).toEqual(['ask a human'])
  })

  it('passes through unchanged when the worker succeeds — no handoff, no escalation', async () => {
    const { ledger, advisor } = await seedRoom()
    const worker: AgentWorker = async () => ({ text: 'the model handled it' })
    const { handoff, calls } = stubHandoff('unused')

    const state = await handoffEscalation({
      ledger,
      worker,
      handoff,
      roomId: 'r1',
      participant: advisor,
      taskId: 't1',
      prompt: 'is the contract sound?',
      at: '2026-06-21T02:00:00.000Z',
    })

    // No escalation condition fired: the seam is never called and nothing is recorded.
    expect(calls).toEqual([])
    expect(state.escalations).toEqual([])
  })

  it('fails closed: a rejecting handoff seam records nothing and propagates', async () => {
    const { ledger, advisor } = await seedRoom()
    const worker: AgentWorker = async () => {
      throw new Error('local model unavailable')
    }
    const handoff: EscalationHandoff = async () => {
      throw new Error('ÆLLI is unreachable')
    }

    await expect(
      handoffEscalation({
        ledger,
        worker,
        handoff,
        roomId: 'r1',
        participant: advisor,
        taskId: 't1',
        prompt: 'p',
        at: '2026-06-21T02:00:00.000Z',
      }),
    ).rejects.toThrow(/unreachable/)

    // The ledger is written only after the seam answers, so a failed handoff leaves no escalation.
    const state = await ledger.getState('r1')
    expect(state?.escalations).toEqual([])
  })

  it('refuses to hand off for a participant that does not hold the advisor role', async () => {
    const { ledger } = await seedRoom()
    const worker: AgentWorker = async () => {
      throw new Error('boom')
    }
    const { handoff, calls } = stubHandoff('x')
    const implementer = assignRole({ id: 'imp', kind: 'agent', roles: [], displayName: 'Imp' }, 'implementer')

    await expect(
      handoffEscalation({
        ledger,
        worker,
        handoff,
        roomId: 'r1',
        participant: implementer,
        taskId: 't1',
        prompt: 'p',
        at: '2026-06-21T02:00:00.000Z',
      }),
    ).rejects.toThrow(/advisor/)
    expect(calls).toEqual([])
  })
})

// Records every shell-out so the argv the worker builds can be asserted exactly, and returns
// a caller-supplied result — the local-model analogue of sandbox-runtime's stub `Run`. No real
// model, process, or network is involved.
function stubRun(result: { code: number, stdout: string, stderr: string }): {
  run: Run
  calls: { cmd: string, args: string[] }[]
} {
  const calls: { cmd: string, args: string[] }[] = []
  const run: Run = async (cmd, args) => {
    calls.push({ cmd, args })
    return result
  }
  return { run, calls }
}

describe('createLocalModelWorker', () => {
  it('shells out to the configured CLI with the prompt and role, mapping stdout to output', async () => {
    const { run, calls } = stubRun({ code: 0, stdout: 'the model says hello\n', stderr: '' })
    const worker = createLocalModelWorker(run, { command: 'llama' })

    const output = await worker({ role: 'advisor', prompt: 'is the contract sound?' })

    // The injected exec seam was invoked exactly once with the configured binary.
    expect(calls).toHaveLength(1)
    expect(calls[0]?.cmd).toBe('llama')
    // The prompt and role both reach the CLI through argv (Run has no stdin).
    expect(calls[0]?.args).toContain('is the contract sound?')
    expect(calls[0]?.args).toContain('advisor')
    // stdout becomes the agent output text, trimmed of the trailing newline.
    expect(output.text).toBe('the model says hello')
  })

  it('passes configured extra args ahead of the role/prompt', async () => {
    const { run, calls } = stubRun({ code: 0, stdout: 'ok', stderr: '' })
    const worker = createLocalModelWorker(run, { command: 'llama', args: ['--model', 'q4'] })

    await worker({ role: 'reviewer', prompt: 'review this' })

    expect(calls[0]?.args).toEqual(['--model', 'q4', '--role', 'reviewer', '--prompt', 'review this'])
  })

  it('throws on a non-zero exit, surfacing stderr', async () => {
    const { run } = stubRun({ code: 1, stdout: '', stderr: 'model not found' })
    const worker = createLocalModelWorker(run, { command: 'llama' })

    await expect(worker({ role: 'advisor', prompt: 'p' })).rejects.toThrow(/model not found/)
  })

  it('throws when the CLI produces no output on a successful exit', async () => {
    const { run } = stubRun({ code: 0, stdout: '   \n', stderr: '' })
    const worker = createLocalModelWorker(run, { command: 'llama' })

    await expect(worker({ role: 'advisor', prompt: 'p' })).rejects.toThrow(/no output/)
  })

  it('is usable as the worker passed to the M6a dispatch path, producing recorded output', async () => {
    const { ledger, advisor } = await seedRoom()
    const { run, calls } = stubRun({ code: 0, stdout: 'escalate: unsure about the API\n', stderr: '' })
    const worker = createLocalModelWorker(run, { command: 'llama' })

    const state = await dispatch({
      ledger,
      worker,
      roomId: 'r1',
      participant: advisor,
      taskId: 't1',
      prompt: 'should we change the contract?',
      at: '2026-06-21T01:00:00.000Z',
    })

    // The dispatch path drove the local worker, which shelled out via the stub Run.
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toContain('should we change the contract?')
    // The model's stdout is the recorded escalation reason.
    expect(state.escalations).toHaveLength(1)
    expect(state.escalations[0]?.reason).toBe('escalate: unsure about the API')
  })
})
