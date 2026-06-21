import { describe, expect, it, vi } from 'vitest'
import { gitDiff } from './git-diff'

describe('gitDiff', () => {
  it('returns stdout on a clean (code 0) exit', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: 'diff --git a/x b/x\n', stderr: '' })
    const out = await gitDiff('/repo', run)
    expect(out).toBe('diff --git a/x b/x\n')
    expect(run).toHaveBeenCalledWith('git', ['-C', '/repo', 'diff'])
  })

  it('throws with stderr on a non-zero exit', async () => {
    const run = vi.fn().mockResolvedValue({ code: 128, stdout: '', stderr: 'not a git repository' })
    await expect(gitDiff('/repo', run)).rejects.toThrow(/not a git repository/)
  })
})
