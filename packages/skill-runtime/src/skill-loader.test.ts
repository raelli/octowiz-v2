import type { ReadFile } from './skill-loader'
import { describe, expect, it } from 'vitest'
import { loadApprovedSkills } from './skill-loader'
import { APPROVED_SKILL_IDS } from './skill-registry'

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

// A fake reader records the path it was asked for and returns scripted file content,
// so the loader is exercised with no real filesystem access (the injected exec-seam).
function fakeReader(content: string) {
  const calls: string[] = []
  const read: ReadFile = async (path) => {
    calls.push(path)
    return content
  }
  return { read, calls }
}

const approvedJson = JSON.stringify({
  schemaVersion: '0.1.0',
  skills: APPROVED_SKILL_IDS.map(id => skill(id)),
})

describe('loadApprovedSkills', () => {
  it('reads through the injected seam at the given path (no real disk)', async () => {
    const { read, calls } = fakeReader(approvedJson)
    await loadApprovedSkills(read, '/some/registry.json')
    expect(calls).toEqual(['/some/registry.json'])
  })

  it('loads and exposes exactly the approved skills', async () => {
    const { read } = fakeReader(approvedJson)
    const skills = await loadApprovedSkills(read, '/some/registry.json')
    expect(skills.map(s => s.id).sort()).toEqual([...APPROVED_SKILL_IDS].sort())
  })

  it('rejects malformed JSON with a clear error rather than partially loading', async () => {
    const { read } = fakeReader('{ this is not json')
    await expect(loadApprovedSkills(read, '/r.json')).rejects.toThrow(/invalid skill registry/i)
  })

  it('rejects a schema-violating registry with a clear error', async () => {
    const { read } = fakeReader(JSON.stringify({ schemaVersion: '0.1.0', skills: [skill('role-separation', { origin: 'nope' })] }))
    await expect(loadApprovedSkills(read, '/r.json')).rejects.toThrow(/invalid skill registry/i)
  })

  it('rejects a registry that references an unapproved skill', async () => {
    const { read } = fakeReader(JSON.stringify({ schemaVersion: '0.1.0', skills: [skill('totally-made-up')] }))
    await expect(loadApprovedSkills(read, '/r.json')).rejects.toThrow(/invalid skill registry/i)
  })
})
