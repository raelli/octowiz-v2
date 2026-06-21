import type { Run } from './index'
import { describe, expect, it } from 'vitest'
import { createPodmanProvider, sandboxName } from './index'

// A fake Run records invocations and returns a scripted result, so the provider is
// exercised with no real container runtime. `firstCall` narrows away `undefined`.
function fakeRun(result: { code: number, stdout?: string, stderr?: string }) {
  const calls: Array<{ cmd: string, args: string[] }> = []
  const run: Run = async (cmd, args) => {
    calls.push({ cmd, args })
    return { code: result.code, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  }
  const firstCall = () => {
    const c = calls[0]
    if (c === undefined)
      throw new Error('no Run call was recorded')
    return c
  }
  return { run, firstCall }
}

describe('sandboxName', () => {
  it('is room-scoped and does not collide across similar ids', () => {
    expect(sandboxName('r1')).toBe('octowiz-sbx-r1')
    expect(sandboxName('r1')).not.toBe(sandboxName('r10'))
  })
})

describe('podman provider', () => {
  it('is named podman', () => {
    expect(createPodmanProvider(fakeRun({ code: 0 }).run).name).toBe('podman')
  })

  it('create runs a detached rootless container and returns the container id', async () => {
    const { run, firstCall } = fakeRun({ code: 0, stdout: 'abc123\n' })
    const handle = await createPodmanProvider(run).create('r1')
    expect(firstCall().cmd).toBe('podman')
    expect(firstCall().args.slice(0, 4)).toEqual(['run', '-d', '--name', 'octowiz-sbx-r1'])
    expect(handle).toEqual({ provider: 'podman', id: 'abc123', roomId: 'r1' })
  })

  it('create ends the argv with the keep-alive command', async () => {
    const { run, firstCall } = fakeRun({ code: 0, stdout: 'id' })
    await createPodmanProvider(run).create('r1')
    expect(firstCall().args.slice(-2)).toEqual(['sleep', 'infinity'])
  })

  it('create takes the last non-empty stdout line as the id (ignores stray output)', async () => {
    const { run } = fakeRun({ code: 0, stdout: 'WARN: cgroups v1\nabc123\n' })
    expect((await createPodmanProvider(run).create('r1')).id).toBe('abc123')
  })

  it('create throws when stdout has no container id despite exit 0', async () => {
    const { run } = fakeRun({ code: 0, stdout: '   \n' })
    await expect(createPodmanProvider(run).create('r1')).rejects.toThrow()
  })

  it('destroy refuses a handle from a different provider', async () => {
    const { run } = fakeRun({ code: 0 })
    await expect(createPodmanProvider(run).destroy({ provider: 'docker', id: 'x', roomId: 'r1' })).rejects.toThrow()
  })

  it('create includes the default image and omits --workdir when not given', async () => {
    const { run, firstCall } = fakeRun({ code: 0, stdout: 'id' })
    await createPodmanProvider(run).create('r1')
    expect(firstCall().args).not.toContain('--workdir')
    expect(firstCall().args.join(' ')).toContain('alpine')
  })

  it('create passes --workdir and an overridden image when given', async () => {
    const { run, firstCall } = fakeRun({ code: 0, stdout: 'id' })
    await createPodmanProvider(run).create('r1', { image: 'my/img:1', workdir: '/repo' })
    expect(firstCall().args.join(' ')).toContain('--workdir /repo')
    expect(firstCall().args).toContain('my/img:1')
  })

  it('create throws on a non-zero exit', async () => {
    const { run } = fakeRun({ code: 125, stderr: 'no such image' })
    await expect(createPodmanProvider(run).create('r1')).rejects.toThrow()
  })

  it('destroy force-removes the container by id', async () => {
    const { run, firstCall } = fakeRun({ code: 0 })
    await createPodmanProvider(run).destroy({ provider: 'podman', id: 'abc123', roomId: 'r1' })
    expect(firstCall()).toEqual({ cmd: 'podman', args: ['rm', '-f', 'abc123'] })
  })

  it('destroy throws on a non-zero exit', async () => {
    const { run } = fakeRun({ code: 1, stderr: 'not found' })
    await expect(createPodmanProvider(run).destroy({ provider: 'podman', id: 'x', roomId: 'r1' })).rejects.toThrow()
  })
})
