import { describe, it, expect } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RoomLedger, FileLedgerStore } from '@octowiz/room-ledger'
import { roomStatusHandler, recordHandler, validateHandler, mergeReadyHandler, selectSkillsHandler } from './tools.js'
import type { Run } from './run.js'

async function fixtureCtx() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-tools-'))
  const ledger = new RoomLedger(new FileLedgerStore(join(root, '.octowiz', 'ledger')))
  const at = '2026-06-25T00:00:00.000Z'
  await ledger.createRoom({ id: 'r1', name: 'demo', status: 'active', createdAt: at }, at)
  return { ledger, roomId: 'r1' }
}

describe('octowiz_room_status', () => {
  it('returns the current room state as JSON text', async () => {
    const ctx = await fixtureCtx()
    const r = await roomStatusHandler(async () => ctx)
    expect(r.isError).toBeFalsy()
    const state = JSON.parse(r.content[0]!.text)
    expect(state.room.id).toBe('r1')
    expect(state.room.name).toBe('demo')
  })
})

describe('octowiz_record', () => {
  it('records a task_created event', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:01:00.000Z'
    const r = await recordHandler(async () => ctx, now, {
      kind: 'task_created', title: 'wire mcp', description: 'expose tools',
    })
    expect(r.isError).toBeFalsy()
    const state = await ctx.ledger.getState('r1')
    expect(state?.tasks.at(-1)?.title).toBe('wire mcp')
  })

  it('records an action milestone tied to a task', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:02:00.000Z'
    await recordHandler(async () => ctx, now, { kind: 'task_created', title: 't' })
    const state0 = await ctx.ledger.getState('r1')
    const taskId = state0!.tasks.at(-1)!.id
    const r = await recordHandler(async () => ctx, now, {
      kind: 'action', tool: 'opencode', summary: 'edited server.ts', taskId,
    })
    expect(r.isError).toBeFalsy()
    const state = await ctx.ledger.getState('r1')
    expect(state?.actions.at(-1)?.summary).toBe('edited server.ts')
  })
})

describe('octowiz_validate', () => {
  it('runs checks via an injected Run and records a passing validation', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:03:00.000Z'
    await recordHandler(async () => ctx, now, { kind: 'task_created', title: 't' })
    const taskId = (await ctx.ledger.getState('r1'))!.tasks.at(-1)!.id
    const passRun: Run = async () => ({ code: 0, stdout: 'ok', stderr: '' })
    const r = await validateHandler(async () => ctx, now, passRun, { taskId })
    expect(r.isError).toBeFalsy()
    const state = await ctx.ledger.getState('r1')
    expect(state?.validations.at(-1)?.status).toBe('passed')
  })
})

describe('octowiz_merge_ready', () => {
  it('reports not-ready with reasons for a fresh task', async () => {
    const ctx = await fixtureCtx()
    const now = () => '2026-06-25T00:04:00.000Z'
    await recordHandler(async () => ctx, now, { kind: 'task_created', title: 't' })
    const taskId = (await ctx.ledger.getState('r1'))!.tasks.at(-1)!.id
    const r = await mergeReadyHandler(async () => ctx, { taskId })
    const parsed = JSON.parse(r.content[0]!.text)
    expect(parsed.ready).toBe(false)
    expect(Array.isArray(parsed.reasons)).toBe(true)
  })
})

describe('octowiz_select_skills', () => {
  it('returns skills for a stage from the real registry', async () => {
    const ctx = await fixtureCtx()
    // octowiz-v2 repo root from this test file: apps/octowiz-mcp/src -> ../../../
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    const registry = join(repoRoot, 'skills', 'registry.json')
    const r = await selectSkillsHandler(async () => ctx, registry, { stage: 'review' })
    expect(r.isError).toBeFalsy()
    const skills = JSON.parse(r.content[0]!.text)
    expect(Array.isArray(skills)).toBe(true)
  })
})
