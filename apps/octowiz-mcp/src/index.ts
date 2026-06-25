import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'
import { makeLedgerResolver } from './room.js'

const cwd = process.cwd()
// listRoots delegates to the low-level server once connected (client must advertise roots).
const server = createServer({
  cwd,
  now: () => new Date().toISOString(),
  listRoots: async () => server.server.listRoots(),
  ledgerDirFor: makeLedgerResolver({ cwd, listRoots: async () => server.server.listRoots() }),
})

const transport = new StdioServerTransport()
await server.connect(transport)
