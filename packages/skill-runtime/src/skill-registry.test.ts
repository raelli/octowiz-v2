import { describe, expect, it } from 'vitest'
import { APPROVED_SKILL_IDS, parseRegistry } from './skill-registry'

// A minimal well-formed skill entry. Trigger fields are present but empty —
// the concrete vocabulary is the matcher slice, not #25, so presence is all
// that is validated here.
function skill(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    origin: 'native',
    workflowStage: 'review',
    triggers: {
      taskType: [],
      repoStack: [],
      role: [],
      workflowStep: [],
      filePaths: [],
      validationFailures: [],
      roomPolicy: [],
    },
    ...overrides,
  }
}

function registryOf(...skills: Array<Record<string, unknown>>) {
  return { schemaVersion: '0.1.0', skills }
}

// A registry covering exactly the approved set, so a valid full registry can be asserted.
function approvedRegistry() {
  return registryOf(...APPROVED_SKILL_IDS.map(id => skill(id)))
}

describe('parseRegistry — valid', () => {
  it('parses a registry of exactly the approved skills', () => {
    const reg = parseRegistry(approvedRegistry())
    expect(reg.skills).toHaveLength(APPROVED_SKILL_IDS.length)
    expect(reg.skills.map(s => s.id).sort()).toEqual([...APPROVED_SKILL_IDS].sort())
  })

  it('exposes the typed fields of each skill', () => {
    const reg = parseRegistry(registryOf(skill('role-separation')))
    const first = reg.skills.at(0)
    expect(first?.id).toBe('role-separation')
    expect(first?.origin).toBe('native')
    expect(first?.workflowStage).toBe('review')
    expect(first?.triggers.taskType).toEqual([])
  })
})

describe('parseRegistry — rejection', () => {
  it('rejects an unknown/unapproved skill id with a clear error', () => {
    expect(() => parseRegistry(registryOf(skill('not-a-real-skill'))))
      .toThrow(/invalid skill registry/i)
  })

  it('rejects a duplicate skill id with a clear error', () => {
    expect(() => parseRegistry(registryOf(skill('role-separation'), skill('role-separation'))))
      .toThrow(/duplicate/i)
  })

  it('rejects an unknown origin', () => {
    expect(() => parseRegistry(registryOf(skill('role-separation', { origin: 'third-party' }))))
      .toThrow(/invalid skill registry/i)
  })

  it('rejects an unknown workflowStage', () => {
    expect(() => parseRegistry(registryOf(skill('role-separation', { workflowStage: 'ship-it' }))))
      .toThrow(/invalid skill registry/i)
  })

  it('rejects a skill missing a trigger-signal field (presence is validated)', () => {
    const broken = skill('role-separation')
    delete (broken.triggers as Record<string, unknown>).roomPolicy
    expect(() => parseRegistry(registryOf(broken)))
      .toThrow(/invalid skill registry/i)
  })

  it('rejects a trigger-signal field that is not an array of strings', () => {
    expect(() => parseRegistry(registryOf(skill('role-separation', {
      triggers: { taskType: 'nope', repoStack: [], role: [], workflowStep: [], filePaths: [], validationFailures: [], roomPolicy: [] },
    })))).toThrow(/invalid skill registry/i)
  })

  it('rejects a wrong schemaVersion', () => {
    expect(() => parseRegistry({ schemaVersion: '9.9.9', skills: [skill('role-separation')] }))
      .toThrow(/invalid skill registry/i)
  })

  it('rejects a non-object input', () => {
    expect(() => parseRegistry('not an object')).toThrow(/invalid skill registry/i)
    expect(() => parseRegistry(null)).toThrow(/invalid skill registry/i)
  })
})
