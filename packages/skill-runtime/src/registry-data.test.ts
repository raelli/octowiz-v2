import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultReadFile, loadApprovedSkills } from './skill-loader'
import { APPROVED_SKILL_IDS } from './skill-registry'

// Integration guard: load the actual committed skills/registry.json through the real
// node:fs reader and assert it validates and exposes exactly the approved skill set.
// This catches a malformed real registry at CI, distinct from the fake-reader unit tests.
const registryPath = fileURLToPath(new URL('../../../skills/registry.json', import.meta.url))

describe('committed skills/registry.json', () => {
  it('loads through the real reader and exposes exactly the approved skills', async () => {
    const skills = await loadApprovedSkills(defaultReadFile, registryPath)
    expect(skills.map(s => s.id).sort()).toEqual([...APPROVED_SKILL_IDS].sort())
  })
})
