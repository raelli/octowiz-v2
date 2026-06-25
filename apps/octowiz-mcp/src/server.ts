import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { makeContext } from './context.js'
import { registerTools } from './tools.js'
import { defaultRun } from './run.js'

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

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'octowiz', version: '0.1.0' })
  const getCtx = makeContext(deps)
  // octowiz-v2 repo root from this file: apps/octowiz-mcp/src -> ../../../
  const registryPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'registry.json')
  registerTools(server, getCtx, deps.now, defaultRun, registryPath)
  return server
}
