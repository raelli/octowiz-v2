import type { RecordAction } from './action-stream'
import type { AelliAdvisor } from './advisory'
import { describe, expect, it, vi } from 'vitest'
import { adviseBeforeTool, resolveAdvisoryTimeoutMs } from './advisory'

/** Fake ledger that records every call so tests can assert one-per-event. */
function makeRecorder(): { recordAction: RecordAction, calls: Array<{ tool: string, summary: string, taskId?: string }> } {
  const calls: Array<{ tool: string, summary: string, taskId?: string }> = []
  const recordAction: RecordAction = async (action) => {
    calls.push(action)
  }
  return { recordAction, calls }
}

const ctx = { tool: 'bash', args: { command: 'rm -rf /' } }

describe('adviseBeforeTool', () => {
  it('advisory recorded + proceeds: a fast recommendation is recorded once as aelli.advisory', async () => {
    const { recordAction, calls } = makeRecorder()
    const advisor: AelliAdvisor = async () => 'looks good'

    await expect(adviseBeforeTool(advisor, recordAction, ctx)).resolves.toBeUndefined()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ tool: 'aelli.advisory', summary: 'looks good' })
  })

  it('threads taskId through when provided', async () => {
    const { recordAction, calls } = makeRecorder()
    const advisor: AelliAdvisor = async () => 'be careful'

    await adviseBeforeTool(advisor, recordAction, ctx, { taskId: 'task-42' })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ tool: 'aelli.advisory', summary: 'be careful', taskId: 'task-42' })
  })

  it('omits taskId cleanly when absent (key not present)', async () => {
    const { recordAction, calls } = makeRecorder()
    const advisor: AelliAdvisor = async () => 'ok'

    await adviseBeforeTool(advisor, recordAction, ctx)

    expect(calls).toHaveLength(1)
    expect('taskId' in calls[0]!).toBe(false)
  })

  it('timeout → proceeds + no record: a slow advisor is abandoned, nothing recorded, still resolves', async () => {
    const { recordAction, calls } = makeRecorder()
    // resolves AFTER the bound — should be abandoned.
    const advisor: AelliAdvisor = () => new Promise<string>((resolve) => {
      setTimeout(resolve, 50, 'too late')
    })

    await expect(adviseBeforeTool(advisor, recordAction, ctx, { timeoutMs: 5 })).resolves.toBeUndefined()

    expect(calls).toHaveLength(0)
  })

  it('a late advisor rejection AFTER timeout does not cause an unhandled rejection', async () => {
    const { recordAction, calls } = makeRecorder()
    const advisor: AelliAdvisor = () => new Promise<string>((_resolve, reject) => {
      setTimeout(() => reject(new Error('late boom')), 30)
    })

    await expect(adviseBeforeTool(advisor, recordAction, ctx, { timeoutMs: 5 })).resolves.toBeUndefined()
    expect(calls).toHaveLength(0)
    // give the late rejection time to fire — it must be swallowed.
    await new Promise(r => setTimeout(r, 50))
    expect(calls).toHaveLength(0)
  })

  it('error → proceeds + no record: an advisor rejection is swallowed, nothing recorded, onError called once', async () => {
    const { recordAction, calls } = makeRecorder()
    const advisor: AelliAdvisor = async () => {
      throw new Error('aelli down')
    }
    const onError = vi.fn()

    await expect(adviseBeforeTool(advisor, recordAction, ctx, { onError })).resolves.toBeUndefined()

    expect(calls).toHaveLength(0)
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]![0] as Error).message).toBe('aelli down')
  })

  it('empty recommendation → no record: an empty/whitespace recommendation is not recorded', async () => {
    const { recordAction, calls } = makeRecorder()

    await adviseBeforeTool(async () => '', recordAction, ctx)
    await adviseBeforeTool(async () => '   ', recordAction, ctx)

    expect(calls).toHaveLength(0)
  })

  it('recordAction failure is non-fatal: still resolves; onError called', async () => {
    const recordAction: RecordAction = async () => {
      throw new Error('ledger write failed')
    }
    const onError = vi.fn()
    const advisor: AelliAdvisor = async () => 'looks good'

    await expect(adviseBeforeTool(advisor, recordAction, ctx, { onError })).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]![0] as Error).message).toBe('ledger write failed')
  })

  it('truncates a very long recommendation to a sane bound (<=500)', async () => {
    const { recordAction, calls } = makeRecorder()
    const advisor: AelliAdvisor = async () => 'x'.repeat(1000)

    await adviseBeforeTool(advisor, recordAction, ctx)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.summary.length).toBe(500)
  })
})

describe('resolveAdvisoryTimeoutMs', () => {
  it('returns the default for undefined', () => {
    expect(resolveAdvisoryTimeoutMs(undefined)).toBe(1500)
  })

  it('returns the default for NaN / non-numeric', () => {
    expect(resolveAdvisoryTimeoutMs('not-a-number')).toBe(1500)
  })

  it('returns the default for <= 0', () => {
    expect(resolveAdvisoryTimeoutMs('0')).toBe(1500)
    expect(resolveAdvisoryTimeoutMs('-100')).toBe(1500)
  })

  it('honors a valid positive number', () => {
    expect(resolveAdvisoryTimeoutMs('800')).toBe(800)
  })
})
