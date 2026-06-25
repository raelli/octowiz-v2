import { describe, it, expect } from 'vitest'
import { resolveRepoRoot } from './room.js'

describe('resolveRepoRoot', () => {
  it('prefers the first file:// MCP root', async () => {
    const listRoots = async () => ({ roots: [{ uri: 'file:///work/repo', name: 'repo' }] })
    expect(await resolveRepoRoot(listRoots, '/somewhere/else')).toBe('/work/repo')
  })

  it('falls back to cwd when no roots and git is unavailable', async () => {
    const listRoots = async () => ({ roots: [] })
    // /tmp is not a git repo -> git rev-parse fails -> cwd
    const root = await resolveRepoRoot(listRoots, '/tmp')
    expect(root).toBe('/tmp')
  })
})
