import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type Ctx, type ToolResult, okText, errText, failOpen } from './context.js'

export async function roomStatusHandler(getCtx: () => Promise<Ctx>): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const state = await ledger.getState(roomId)
  if (!state) return errText(`room ${roomId} not found`)
  return okText(JSON.stringify(state, null, 2))
}

export function registerTools(server: McpServer, getCtx: () => Promise<Ctx>): void {
  server.registerTool(
    'octowiz_room_status',
    {
      description: 'Current octowiz room state for this repo: participants, tasks, reviews, validations, escalations.',
      inputSchema: {},
    },
    failOpen(async () => roomStatusHandler(getCtx)),
  )
}
