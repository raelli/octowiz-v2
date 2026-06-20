import { describe, expect, it } from 'vitest'
import { LedgerEventSchema, RoomSchema, SCHEMAS_VERSION } from './index'

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
})
