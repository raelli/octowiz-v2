import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from './server.js'

describe('server smoke', () => {
  it('boots and exposes the expected tool names', async () => {
    const server = createServer({
      cwd: '/tmp',
      now: () => '2026-06-25T00:00:00.000Z',
      listRoots: undefined,
      ledgerDirFor: async () => '/tmp/.octowiz/ledger',
    })

    const client = new Client({ name: 'smoke-test', version: '0.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    // Connect both ends simultaneously to avoid deadlock (client sends initialize first)
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ])

    const { tools } = await client.listTools()
    const names = tools.map(t => t.name)

    for (const expected of [
      'octowiz_room_status',
      'octowiz_record',
      'octowiz_validate',
      'octowiz_merge_ready',
      'octowiz_select_skills',
    ]) {
      expect(names).toContain(expected)
    }
  })
})
