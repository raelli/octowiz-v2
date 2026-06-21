import type { ProviderName, Run } from './index'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { sandboxName, selectProvider } from './index'

// Gated real-container smoke: only runs when OCTOWIZ_SANDBOX_SMOKE is set AND a container
// runtime is present — otherwise it SKIPs (never a false-green pass), mirroring the CLI's
// OCTOWIZ_SMOKE. This is the real-binary check deferred from M5a: it confirms the keep-alive
// (`sleep infinity`) actually keeps the container running on the default image.
const execFileAsync = promisify(execFile)
const realRun: Run = async (cmd, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args)
    return { code: 0, stdout, stderr }
  }
  catch (error) {
    const e = error as { code?: number, stdout?: string, stderr?: string }
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(error) }
  }
}

it('creates a running container then destroys it', async (ctx) => {
  if (!process.env.OCTOWIZ_SANDBOX_SMOKE)
    return ctx.skip()
  // `info` (not `--version`) needs a reachable daemon — a CLI present but daemon down must
  // SKIP, not fail. That's the "no usable runtime → skip cleanly" guarantee.
  const podmanOk = (await realRun('podman', ['info'])).code === 0
  const dockerOk = (await realRun('docker', ['info'])).code === 0
  if (!podmanOk && !dockerOk)
    return ctx.skip()

  const name: ProviderName = podmanOk ? 'podman' : 'docker'
  const provider = selectProvider(name, realRun)
  const roomId = `smoke${process.pid}`
  await realRun(name, ['rm', '-f', sandboxName(roomId)]) // clear any leftover from a failed run

  const handle = await provider.create(roomId)
  try {
    expect(handle.id).not.toBe('')
    // The container must still be running — proves `sleep infinity` kept it alive, not exited.
    const ps = await realRun(name, ['ps', '--filter', `name=${sandboxName(roomId)}`, '--format', '{{.Names}}'])
    expect(ps.stdout).toContain(sandboxName(roomId))
  }
  finally {
    await provider.destroy(handle)
  }
}, 120_000)
