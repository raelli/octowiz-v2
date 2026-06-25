import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface ServerDeps {
  /** Resolve the ledger directory for the active repo (caches internally). */
  ledgerDirFor: () => Promise<string>
  /** MCP client roots accessor, if the client supports it. */
  listRoots?: () => Promise<{ roots: { uri: string, name?: string }[] }>
  /** Process working directory (fallback for repo resolution). */
  cwd: string
  /** Injected clock. */
  now: () => string
}

export function createServer(_deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'octowiz', version: '0.1.0' })
  // tools registered in later tasks
  return server
}
