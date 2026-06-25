import type { ServerDeps } from './server.js'
import { describe, expect, it } from 'vitest'
import { createServer } from './server.js'

function fakeDeps(): ServerDeps {
  return {
    ledgerDirFor: async () => '/tmp/nonexistent/.octowiz/ledger',
    listRoots: undefined,
    cwd: '/tmp/nonexistent',
    now: () => '2026-06-25T00:00:00.000Z',
  }
}

describe('createServer', () => {
  it('constructs an McpServer without throwing', () => {
    const server = createServer(fakeDeps())
    expect(server).toBeDefined()
  })
})
