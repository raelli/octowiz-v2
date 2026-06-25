import process from 'node:process'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { makeLedgerResolver } from './room.js'
import { createServer } from './server.js'

const cwd = process.cwd()
// listRoots delegates to the low-level server once connected (client must advertise roots).
const server = createServer({
  cwd,
  now: () => new Date().toISOString(),
  listRoots: async () => server.server.listRoots(),
  ledgerDirFor: makeLedgerResolver({ cwd, listRoots: async () => server.server.listRoots() }),
})

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
