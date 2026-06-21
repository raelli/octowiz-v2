import type { Skill, WorkflowStage } from './skill-registry'
import { describe, expect, it } from 'vitest'
import { selectSkills } from './skill-selector'

// A minimal well-formed skill, defaulting to empty triggers (matching today's
// registry). Overrides let a test set stage or populate a trigger list.
function skill(id: string, stage: WorkflowStage, triggers: Partial<Skill['triggers']> = {}): Skill {
  return {
    id: id as Skill['id'],
    origin: 'native',
    workflowStage: stage,
    triggers: {
      taskType: [],
      repoStack: [],
      role: [],
      workflowStep: [],
      filePaths: [],
      validationFailures: [],
      roomPolicy: [],
      ...triggers,
    },
  }
}

describe('selectSkills — stage matching', () => {
  it('selects skills whose workflowStage equals ctx.stage', () => {
    const skills = [skill('code-review', 'review'), skill('task-planning', 'plan')]
    const got = selectSkills(skills, { stage: 'review' })
    expect(got.map(s => s.id)).toEqual(['code-review'])
  })

  it('always includes cross-cutting "all" skills regardless of stage', () => {
    const skills = [skill('ledger-recording', 'all'), skill('task-planning', 'plan')]
    expect(selectSkills(skills, { stage: 'review' }).map(s => s.id)).toEqual(['ledger-recording'])
    expect(selectSkills(skills, { stage: 'plan' }).map(s => s.id)).toEqual(['ledger-recording', 'task-planning'])
  })

  it('preserves input order', () => {
    const skills = [skill('task-planning', 'plan'), skill('ledger-recording', 'all'), skill('brainstorming', 'plan')]
    expect(selectSkills(skills, { stage: 'plan' }).map(s => s.id)).toEqual(['task-planning', 'ledger-recording', 'brainstorming'])
  })
})

describe('selectSkills — trigger narrowing', () => {
  it('narrows out a stage match whose non-empty trigger has no intersection with the context signal', () => {
    const skills = [skill('code-review', 'review', { repoStack: ['ts'] })]
    expect(selectSkills(skills, { stage: 'review', repoStack: ['py'] })).toEqual([])
  })

  it('keeps a stage match whose non-empty trigger intersects the context signal', () => {
    const skills = [skill('code-review', 'review', { repoStack: ['ts'] })]
    expect(selectSkills(skills, { stage: 'review', repoStack: ['ts', 'py'] }).map(s => s.id)).toEqual(['code-review'])
  })

  it('does not constrain when the declared trigger is empty', () => {
    const skills = [skill('code-review', 'review', { repoStack: [] })]
    expect(selectSkills(skills, { stage: 'review', repoStack: ['py'] }).map(s => s.id)).toEqual(['code-review'])
  })

  it('does not constrain when the context omits the signal', () => {
    const skills = [skill('code-review', 'review', { repoStack: ['ts'] })]
    expect(selectSkills(skills, { stage: 'review' }).map(s => s.id)).toEqual(['code-review'])
  })

  it('narrows across multiple signals (all non-empty declared triggers must intersect)', () => {
    const skills = [skill('code-review', 'review', { role: ['reviewer'], taskType: ['feature'] })]
    expect(selectSkills(skills, { stage: 'review', role: ['reviewer'], taskType: ['bug'] })).toEqual([])
    expect(selectSkills(skills, { stage: 'review', role: ['reviewer'], taskType: ['feature'] }).map(s => s.id)).toEqual(['code-review'])
  })
})
