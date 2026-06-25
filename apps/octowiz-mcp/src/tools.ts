import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type Ctx, type ToolResult, okText, errText, failOpen } from './context.js'

export async function roomStatusHandler(getCtx: () => Promise<Ctx>): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const state = await ledger.getState(roomId)
  if (!state) return errText(`room ${roomId} not found`)
  return okText(JSON.stringify(state, null, 2))
}

const recordInput = {
  kind: z.enum(['task_created', 'task_status', 'review', 'action']),
  // task_created
  title: z.string().optional(),
  description: z.string().optional(),
  // task_status
  taskId: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'in_review', 'validated', 'merged', 'blocked']).optional(),
  // review
  reviewerId: z.string().optional(),
  verdict: z.enum(['approved', 'rejected', 'changes_requested']).optional(),
  notes: z.string().optional(),
  // action
  tool: z.string().optional(),
  summary: z.string().optional(),
}

type RecordArgs = {
  kind: 'task_created' | 'task_status' | 'review' | 'action'
  title?: string, description?: string
  taskId?: string, status?: 'open' | 'in_progress' | 'in_review' | 'validated' | 'merged' | 'blocked'
  reviewerId?: string, verdict?: 'approved' | 'rejected' | 'changes_requested', notes?: string
  tool?: string, summary?: string
}

export async function recordHandler(getCtx: () => Promise<Ctx>, now: () => string, args: RecordArgs): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const at = now()
  const idFrom = (p: string) => `${p}${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
  switch (args.kind) {
    case 'task_created': {
      if (!args.title) return errText('task_created requires `title`')
      const task = { id: idFrom('t'), roomId, title: args.title, description: args.description, status: 'open' as const }
      await ledger.createTask(task, at)
      return okText(`task ${task.id} created`)
    }
    case 'task_status': {
      if (!args.taskId || !args.status) return errText('task_status requires `taskId` and `status`')
      await ledger.setTaskStatus(roomId, args.taskId, args.status, at)
      return okText(`task ${args.taskId} -> ${args.status}`)
    }
    case 'review': {
      if (!args.taskId || !args.reviewerId || !args.verdict) return errText('review requires `taskId`, `reviewerId`, `verdict`')
      const review = { id: idFrom('rv'), taskId: args.taskId, reviewerId: args.reviewerId, verdict: args.verdict, notes: args.notes, createdAt: at }
      await ledger.recordReview(roomId, review, at)
      return okText(`review ${review.id} (${args.verdict}) recorded`)
    }
    case 'action': {
      if (!args.tool || !args.summary) return errText('action requires `tool` and `summary`')
      await ledger.recordAction(roomId, args.tool, args.summary, at, args.taskId)
      return okText('action recorded')
    }
  }
}

export function registerTools(server: McpServer, getCtx: () => Promise<Ctx>, now: () => string): void {
  server.registerTool(
    'octowiz_room_status',
    {
      description: 'Current octowiz room state for this repo: participants, tasks, reviews, validations, escalations.',
      inputSchema: {},
    },
    failOpen(async () => roomStatusHandler(getCtx)),
  )
  server.registerTool(
    'octowiz_record',
    {
      description: 'Record a milestone to the room ledger: task_created | task_status | review | action. Call at meaningful points, not per edit.',
      inputSchema: recordInput,
    },
    failOpen(async (args: RecordArgs) => recordHandler(getCtx, now, args)),
  )
}
