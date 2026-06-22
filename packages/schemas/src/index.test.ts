import { describe, expect, it } from 'vitest'
import { LedgerEventSchema, RoomSchema, RoomStateSchema, SCHEMAS_VERSION } from './index'

describe('schemas', () => {
  it('exposes the bumped version', () => {
    expect(SCHEMAS_VERSION).toBe('0.1.0')
  })

  it('parses a valid room', () => {
    const room = RoomSchema.parse({ id: 'r1', name: 'Room One', status: 'active', createdAt: '2026-06-20T00:00:00Z' })
    expect(room.id).toBe('r1')
  })

  it('rejects a room with an unknown status', () => {
    expect(() => RoomSchema.parse({ id: 'r1', name: 'Room One', status: 'nope', createdAt: 'x' })).toThrow()
  })

  it('parses a room.created event and rejects an unknown event type', () => {
    const event = LedgerEventSchema.parse({
      type: 'room.created',
      at: '2026-06-20T00:00:00Z',
      room: { id: 'r1', name: 'Room One', status: 'active', createdAt: 'x' },
    })
    expect(event.type).toBe('room.created')
    expect(() => LedgerEventSchema.parse({ type: 'bogus', at: 'x' })).toThrow()
  })

  it('parses a session.started event', () => {
    const event = { type: 'session.started', at: '2026-06-21T00:00:00Z', roomId: 'r1', tool: 'zellij', sessionName: 'octowiz-r1' }
    expect(LedgerEventSchema.parse(event)).toEqual(event)
  })

  it('rejects session.started with an unknown tool', () => {
    const bad = { type: 'session.started', at: '2026-06-21T00:00:00Z', roomId: 'r1', tool: 'tmux', sessionName: 'octowiz-r1' }
    expect(() => LedgerEventSchema.parse(bad)).toThrow()
  })

  it('parses a sandbox.started event', () => {
    const event = { type: 'sandbox.started', at: '2026-06-21T00:00:00Z', roomId: 'r1', provider: 'podman', sandboxId: 'abc123' }
    expect(LedgerEventSchema.parse(event)).toEqual(event)
  })

  it('rejects sandbox.started with an empty provider', () => {
    const bad = { type: 'sandbox.started', at: '2026-06-21T00:00:00Z', roomId: 'r1', provider: '', sandboxId: 'abc123' }
    expect(() => LedgerEventSchema.parse(bad)).toThrow()
  })

  it('accepts a RoomState with sessions and sandboxes', () => {
    const sessions = [{ tool: 'zellij', sessionName: 'octowiz-r1', at: '2026-06-21T00:00:00Z' }]
    const sandboxes = [{ provider: 'podman', sandboxId: 'abc123', at: '2026-06-21T00:00:00Z' }]
    const state = RoomStateSchema.parse({
      room: { id: 'r1', name: 'R', status: 'active', createdAt: '2026-06-21T00:00:00Z' },
      participants: [],
      tasks: [],
      reviews: [],
      validations: [],
      escalations: [],
      advice: [],
      sessions,
      sandboxes,
    })
    expect(state.sessions).toEqual(sessions)
    expect(state.sandboxes).toEqual(sandboxes)
  })
})
