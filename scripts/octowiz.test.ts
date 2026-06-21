import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { describe, expect, it, vi } from 'vitest'
import { runCli } from './octowiz'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'octowiz-cli-'))
  const ledger = new RoomLedger(new FileLedgerStore(root))
  let clock = 0
  const now = () => `2026-06-21T00:00:${String(clock++).padStart(2, '0')}Z`
  const run = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' })
  return { root, ledger, now, run }
}

describe('create-room', () => {
  it('writes a room.created event', async () => {
    const { root, ledger, now, run } = await fixture()
    const state = await runCli(['create-room', '--name', 'Demo'], { ledger, run, now })
    expect(state.room.name).toBe('Demo')
    const rooms = await new FileLedgerStore(root).listRooms()
    expect(rooms).toEqual([state.room.id])
  })
})

describe('start', () => {
  it('records zellij then opencode session starts and dispatches opencode argv', async () => {
    const { ledger, now, run } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], { ledger, run, now })
    const roomId = created.room.id
    await runCli(['start', '--room', roomId, '--repo', '/repos/app'], { ledger, run, now })
    const after = await ledger.getState(roomId)
    expect(after?.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
    const dispatchedOpencode = run.mock.calls.some(([cmd, args]) => cmd === 'zellij' && args.join(' ').includes('opencode'))
    expect(dispatchedOpencode).toBe(true)
  })
})

describe('validate', () => {
  it('records a Validation to the ledger', async () => {
    const { ledger, now, run } = await fixture()
    const created = await runCli(['create-room', '--name', 'Demo'], { ledger, run, now })
    const roomId = created.room.id
    await ledger.createTask({ id: 'task1', roomId, title: 'T', status: 'open' }, now())
    await runCli(['validate', '--room', roomId, '--task', 'task1'], { ledger, run, now })
    const after = await ledger.getState(roomId)
    expect(after?.validations).toHaveLength(1)
    expect(after?.validations[0]?.status).toBe('passed')
  })
})

describe('up', () => {
  it('creates a room and starts its sessions in one command', async () => {
    const { ledger, now, run } = await fixture()
    const state = await runCli(['up', '--name', 'Demo', '--repo', '/repos/app'], { ledger, run, now })
    expect(state.sessions.map(s => s.tool)).toEqual(['zellij', 'opencode'])
  })
})

describe('errors', () => {
  it('throws on an unknown subcommand', async () => {
    const { ledger, now, run } = await fixture()
    await expect(runCli(['bogus'], { ledger, run, now })).rejects.toThrow(/unknown subcommand/)
  })

  it('throws when a required flag is missing', async () => {
    const { ledger, now, run } = await fixture()
    await expect(runCli(['create-room'], { ledger, run, now })).rejects.toThrow(/--name/)
  })
})
