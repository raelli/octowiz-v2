import type { ReviewVerdict, RoomState } from '@octowiz/schemas'
import type { Deps } from './octowiz'

// runCli arrives as an injected param so orchestrate composes the subcommands without
// value-importing octowiz.ts — keeping the module cycle compile-time (type-only) and the
// subcommands the single source of truth (same DRY shape as the `up` command).
export type RunCli = (argv: string[], deps: Deps) => Promise<RoomState>

export interface OrchestrateArgs {
  room: string
  task: string
  agent: string
  reviewer: string
  repo: string
  branch: string
  base?: string
  verdict?: ReviewVerdict
}

/**
 * Drive one task through the whole flow by chaining the discrete subcommands end-to-end:
 * assign → start → validate → skills → review → escalate → deliver. escalate is always
 * invoked but only fires when a trigger did; if it fired we stop short of delivery and
 * return the escalated state (human/ÆLLI takes over), otherwise deliver opens the PR.
 */
export async function orchestrate(args: OrchestrateArgs, deps: Deps, runCli: RunCli): Promise<RoomState> {
  const { room, task, agent, reviewer, repo, branch, base = 'main', verdict = 'approved' } = args
  await runCli(['assign', '--room', room, '--task', task, '--agent', agent], deps)
  await runCli(['start', '--room', room, '--repo', repo], deps)
  await runCli(['validate', '--room', room, '--task', task], deps)
  await runCli(['skills', '--room', room, '--task', task, '--stage', 'review'], deps)
  await runCli(['review', '--room', room, '--task', task, '--reviewer', reviewer, '--verdict', verdict, '--repo', repo], deps)
  const escalated = await runCli(['escalate', '--room', room, '--task', task], deps)
  // A trigger fired (failed validation / rejection / block) — stop before delivery.
  if (escalated.escalations.some(e => e.taskId === task))
    return escalated
  return runCli(['deliver', '--room', room, '--task', task, '--branch', branch, '--base', base], deps)
}
