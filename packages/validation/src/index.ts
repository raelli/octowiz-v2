import type { Validation, ValidationCheck } from '@octowiz/schemas'

export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

export interface Check {
  name: string
  cmd: string
  args: string[]
}

/** Workspace gate commands — overridable by the caller. */
export const DEFAULT_CHECKS: Check[] = [
  { name: 'lint', cmd: 'pnpm', args: ['lint'] },
  { name: 'type-check', cmd: 'pnpm', args: ['-r', 'type-check'] },
  { name: 'test', cmd: 'pnpm', args: ['-r', 'test'] },
]

/**
 * Run each check via the injected `run`, map exit code to passed/failed, capture output.
 * Pure mapping — the caller passes the result to RoomLedger.recordValidation. `now` is
 * caller-supplied to keep time out of the core.
 */
export async function runValidation(taskId: string, checks: Check[], run: Run, now: string): Promise<Validation> {
  const results: ValidationCheck[] = []
  for (const check of checks) {
    const { code, stdout, stderr } = await run(check.cmd, check.args)
    results.push({
      name: check.name,
      status: code === 0 ? 'passed' : 'failed',
      output: [stdout, stderr].filter(Boolean).join('\n') || undefined,
    })
  }
  const status = results.every(c => c.status === 'passed') ? 'passed' : 'failed'
  return { id: `val-${taskId}-${now}`, taskId, status, checks: results, createdAt: now }
}
