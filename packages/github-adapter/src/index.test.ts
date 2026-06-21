import { describe, expect, it, vi } from 'vitest'
import { createBranch, openPullRequest, openPullRequestForBranch } from './index'

const ok = { code: 0, stdout: '', stderr: '' }

describe('createBranch', () => {
  it('creates the branch then pushes it upstream', async () => {
    const run = vi.fn().mockResolvedValue(ok)
    await createBranch('feat/x', run)
    expect(run).toHaveBeenCalledTimes(2)
    const [switchCall, pushCall] = run.mock.calls
    expect(switchCall![0]).toBe('git')
    expect(switchCall![1]).toEqual(['switch', '-c', 'feat/x'])
    expect(pushCall![0]).toBe('git')
    expect(pushCall![1]).toEqual(['push', '-u', 'origin', 'feat/x'])
  })

  it('throws with stderr when the branch cannot be created', async () => {
    const run = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'already exists' })
    await expect(createBranch('feat/x', run)).rejects.toThrow(/already exists/)
    expect(run).toHaveBeenCalledTimes(1) // does not push after a failed switch
  })

  it('throws with stderr when the push fails', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ code: 128, stdout: '', stderr: 'no upstream' })
    await expect(createBranch('feat/x', run)).rejects.toThrow(/no upstream/)
  })
})

describe('openPullRequest', () => {
  it('opens a PR via gh and returns the printed url', async () => {
    const url = 'https://github.com/raelli/octowiz-v2/pull/42'
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: `${url}\n`, stderr: '' })
    const result = await openPullRequest({ head: 'feat/x', base: 'main', title: 't', body: 'b' }, run)
    expect(result).toBe(url)
    const [cmd, args] = run.mock.calls[0]!
    expect(cmd).toBe('gh')
    expect(args).toEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'feat/x',
      '--title',
      't',
      '--body',
      'b',
    ])
  })

  it('takes the last non-empty stdout line as the url', async () => {
    const url = 'https://github.com/raelli/octowiz-v2/pull/7'
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: `warning: something\n${url}\n`, stderr: '' })
    expect(await openPullRequest({ head: 'feat/x', base: 'main', title: 't', body: 'b' }, run)).toBe(url)
  })

  it('throws with stderr when gh fails', async () => {
    const run = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'gh: not authenticated' })
    await expect(
      openPullRequest({ head: 'feat/x', base: 'main', title: 't', body: 'b' }, run),
    ).rejects.toThrow(/not authenticated/)
  })

  it('throws when gh prints no url', async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: '   \n', stderr: '' })
    await expect(
      openPullRequest({ head: 'feat/x', base: 'main', title: 't', body: 'b' }, run),
    ).rejects.toThrow(/no pull request url/i)
  })
})

describe('openPullRequestForBranch', () => {
  it('creates the branch, pushes, then opens the PR end-to-end', async () => {
    const url = 'https://github.com/raelli/octowiz-v2/pull/99'
    const run = vi.fn()
      .mockResolvedValueOnce(ok) // git switch -c
      .mockResolvedValueOnce(ok) // git push -u
      .mockResolvedValueOnce({ code: 0, stdout: `${url}\n`, stderr: '' }) // gh pr create
    const result = await openPullRequestForBranch(
      { branch: 'feat/x', base: 'main', title: 't', body: 'b' },
      run,
    )
    expect(result).toBe(url)
    expect(run).toHaveBeenCalledTimes(3)
    const [switchCall, pushCall, prCall] = run.mock.calls
    expect(switchCall![1]).toEqual(['switch', '-c', 'feat/x'])
    expect(pushCall![1]).toEqual(['push', '-u', 'origin', 'feat/x'])
    expect(prCall![0]).toBe('gh')
    expect(prCall![1]).toEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'feat/x',
      '--title',
      't',
      '--body',
      'b',
    ])
  })

  it('does not open a PR when branch creation fails', async () => {
    const run = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'boom' })
    await expect(
      openPullRequestForBranch({ branch: 'feat/x', base: 'main', title: 't', body: 'b' }, run),
    ).rejects.toThrow(/boom/)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
