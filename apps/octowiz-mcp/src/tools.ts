import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Ctx, ToolResult } from './context.js'
import type { Run } from './run.js'
import { readFile } from 'node:fs/promises'
import { isMergeReady } from '@octowiz/doctrine'
import { loadApprovedSkills, selectSkills } from '@octowiz/skill-runtime'
import { DEFAULT_CHECKS, runValidation } from '@octowiz/validation'
import { z } from 'zod'
import { errText, failOpen, okText } from './context.js'

export async function roomStatusHandler(getCtx: () => Promise<Ctx>): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const state = await ledger.getState(roomId)
  if (!state)
    return errText(`room ${roomId} not found`)
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

interface RecordArgs {
  kind: 'task_created' | 'task_status' | 'review' | 'action'
  title?: string
  description?: string
  taskId?: string
  status?: 'open' | 'in_progress' | 'in_review' | 'validated' | 'merged' | 'blocked'
  reviewerId?: string
  verdict?: 'approved' | 'rejected' | 'changes_requested'
  notes?: string
  tool?: string
  summary?: string
}

export async function recordHandler(getCtx: () => Promise<Ctx>, now: () => string, args: RecordArgs): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const at = now()
  const idFrom = (p: string): string => `${p}${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
  switch (args.kind) {
    case 'task_created': {
      if (!args.title)
        return errText('task_created requires `title`')
      const task = { id: idFrom('t'), roomId, title: args.title, description: args.description, status: 'open' as const }
      await ledger.createTask(task, at)
      return okText(`task ${task.id} created`)
    }
    case 'task_status': {
      if (!args.taskId || !args.status)
        return errText('task_status requires `taskId` and `status`')
      await ledger.setTaskStatus(roomId, args.taskId, args.status, at)
      return okText(`task ${args.taskId} -> ${args.status}`)
    }
    case 'review': {
      if (!args.taskId || !args.reviewerId || !args.verdict)
        return errText('review requires `taskId`, `reviewerId`, `verdict`')
      const review = { id: idFrom('rv'), taskId: args.taskId, reviewerId: args.reviewerId, verdict: args.verdict, notes: args.notes, createdAt: at }
      await ledger.recordReview(roomId, review, at)
      return okText(`review ${review.id} (${args.verdict}) recorded`)
    }
    case 'action': {
      if (!args.tool || !args.summary)
        return errText('action requires `tool` and `summary`')
      await ledger.recordAction(roomId, args.tool, args.summary, at, args.taskId)
      return okText('action recorded')
    }
  }
}

export async function validateHandler(getCtx: () => Promise<Ctx>, now: () => string, run: Run, args: { taskId: string }): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const at = now()
  const validation = await runValidation(args.taskId, DEFAULT_CHECKS, run, at)
  await ledger.recordValidation(roomId, validation, at)
  if (validation.status === 'passed')
    await ledger.setTaskStatus(roomId, args.taskId, 'validated', at)
  return okText(JSON.stringify(validation, null, 2))
}

export async function mergeReadyHandler(getCtx: () => Promise<Ctx>, args: { taskId: string }): Promise<ToolResult> {
  const { ledger, roomId } = await getCtx()
  const state = await ledger.getState(roomId)
  if (!state)
    return errText(`room ${roomId} not found`)
  return okText(JSON.stringify(isMergeReady(state, args.taskId), null, 2))
}

export async function selectSkillsHandler(
  getCtx: () => Promise<Ctx>,
  registryPath: string,
  args: { stage: 'plan' | 'implement' | 'review' | 'validate' | 'escalate' | 'deliver', role?: string[] },
): Promise<ToolResult> {
  await getCtx() // ensures a room exists / consistent with other tools
  const skills = await loadApprovedSkills(p => readFile(p, 'utf8'), registryPath)
  const selected = selectSkills(skills, { stage: args.stage, role: args.role })
  return okText(JSON.stringify(selected, null, 2))
}

export function registerTools(server: McpServer, getCtx: () => Promise<Ctx>, now: () => string, run: Run, registryPath: string): void {
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
  server.registerTool(
    'octowiz_validate',
    { description: 'Run lint/type-check/test for a task, record the validation, advance to validated if passed.', inputSchema: { taskId: z.string() } },
    failOpen(async (args: { taskId: string }) => validateHandler(getCtx, now, run, args)),
  )
  server.registerTool(
    'octowiz_merge_ready',
    { description: 'Doctrine gate: is a task merge-ready? (passing validation + a qualified non-self approval).', inputSchema: { taskId: z.string() } },
    failOpen(async (args: { taskId: string }) => mergeReadyHandler(getCtx, args)),
  )
  server.registerTool(
    'octowiz_select_skills',
    {
      description: 'Skills relevant to the current workflow stage from the approved registry.',
      inputSchema: { stage: z.enum(['plan', 'implement', 'review', 'validate', 'escalate', 'deliver']), role: z.array(z.string()).optional() },
    },
    failOpen(async (args: { stage: any, role?: string[] }) => selectSkillsHandler(getCtx, registryPath, args)),
  )
}
