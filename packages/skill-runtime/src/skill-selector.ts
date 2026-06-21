import type { Skill, WorkflowStage } from './skill-registry'

// Task context the selector matches skills against. `stage` is the operative axis
// today (registry triggers are all empty); role/taskType/repoStack are optional
// forward-compatible narrowing signals. `stage` is a concrete workflow step you're
// AT (never 'all') — 'all' is the cross-cutting marker on a SKILL, not a step, and
// passing it here would select only 'all'-tagged skills, the opposite of "everything".
export interface SkillContext {
  stage: Exclude<WorkflowStage, 'all'>
  role?: string[]
  taskType?: string[]
  repoStack?: string[]
}

// A declared trigger constrains a match only when it is non-empty AND the context
// supplies that signal — then it requires an intersection. Empty declaration or
// absent signal does not constrain.
function intersects(declared: string[], signal: string[] | undefined): boolean {
  if (declared.length === 0 || signal === undefined)
    return true
  return declared.some(d => signal.includes(d))
}

/**
 * Pure matcher: returns the approved skills that apply to a task context. A skill is
 * selected when it is cross-cutting (`workflowStage === 'all'`) or its stage matches
 * `ctx.stage`, and it survives trigger narrowing on every role/taskType/repoStack
 * signal. Preserves input order; no I/O.
 */
export function selectSkills(skills: Skill[], ctx: SkillContext): Skill[] {
  return skills.filter((skill) => {
    if (skill.workflowStage !== 'all' && skill.workflowStage !== ctx.stage)
      return false
    return intersects(skill.triggers.role, ctx.role)
      && intersects(skill.triggers.taskType, ctx.taskType)
      && intersects(skill.triggers.repoStack, ctx.repoStack)
  })
}
