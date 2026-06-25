import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer, type ServerDeps } from './server.js'
import { makeLedgerResolver } from './room.js'

const server = createServer(buildDeps())
const transport = new StdioServerTransport()
await server.connect(transport)

function buildDeps(): ServerDeps {
  const cwd = process.cwd()
  const now = () => new Date().toISOString()
  // listRoots is wired from the connected server in Task 3's integration step.
  const ledgerDirFor = makeLedgerResolver({ listRoots: undefined, cwd })
  return { ledgerDirFor, listRoots: undefined, cwd, now }
}
