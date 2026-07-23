import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

export function sessionName(roomId: string): string {
  return `octowiz-${roomId}`
}

/** True if a session named `name` appears in `zellij list-sessions -n -s` output. */
function hasSession(listOutput: string, name: string): boolean {
  // `-s` prints just the name per line, `-n` drops colors — so the leading token is the
  // session name. Match the whole name so octowiz-r1 does not match octowiz-r10.
  return listOutput
    .split('\n')
    .map(line => line.trim().split(/\s+/)[0])
    .includes(name)
}

/**
 * Ensure the room's Zellij session exists, creating it detached if absent. Idempotent:
 * if the session already exists, this is a no-op (attach-friendly — a human can attach
 * to the same name later). Verified against zellij 0.44.3.
 */
export async function ensureSession(roomId: string, run: Run): Promise<void> {
  const name = sessionName(roomId)
  const list = await run('zellij', ['list-sessions', '-n', '-s'])
  if (hasSession(list.stdout, name))
    return
  // `attach --create-background` creates a detached session without a TTY (no client
  // attached), unlike `attach`/`-s` which start an interactive client.
  const created = await run('zellij', ['attach', '--create-background', name])
  if (created.code !== 0)
    throw new Error(`failed to create zellij session ${name}: ${created.stderr}`)
}

/**
 * Launch `argv` in a new pane of the room's session. The global `--session` flag routes
 * the `run` subcommand to the named (possibly detached) session. Verified against 0.44.3.
 */
export async function runInSession(roomId: string, argv: string[], run: Run): Promise<void> {
  const name = sessionName(roomId)
  const result = await run('zellij', ['--session', name, 'run', '--', ...argv])
  if (result.code !== 0)
    throw new Error(`failed to run in zellij session ${name}: ${result.stderr}`)
}

// --- SSH-run seam: drive a room's zellij legs on a remote host (e.g. the M3) ----
// The octowiz room flow is verified against zellij 0.44.3 on a remote host reached
// over SSH. `ssh host 'zellij …'` is non-interactive (no TTY) — the room's detached
// session is created and driven without a client attached, exactly as locally. This
// `Run` rebuilds `cmd args…` as one shell-quoted remote command string so the remote
// shell re-tokenizes it back to the original argv.

const execFileAsync = promisify(execFile)

/** Shell-quote one argv token for safe concatenation into a remote command string. */
export function quoteArg(arg: string): string {
  // Wrap in single quotes; escape an embedded single quote via the '\'' idiom.
  // An empty arg becomes '' so it is preserved as a distinct token on the remote side.
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

export interface SshRunOptions {
  /** Extra `ssh -o <k>=<v>` options (e.g. { ConnectTimeout: '10' }). */
  options?: Record<string, string>
}

/**
 * Build the argv passed to the local `ssh` binary: `[-o k=v …,] host -- <remoteCmd>`.
 * Pure so tests can assert the exact wiring without spawning ssh.
 */
export function buildSshArgs(host: string, opts: SshRunOptions | undefined, cmd: string, args: string[]): string[] {
  const remoteCmd = [cmd, ...args].map(quoteArg).join(' ')
  const sshArgs: string[] = []
  for (const [k, v] of Object.entries(opts?.options ?? {}))
    sshArgs.push('-o', `${k}=${v}`)
  sshArgs.push(host, '--', remoteCmd)
  return sshArgs
}

/** Injectable ssh executor — defaults to the real `ssh` binary; tests pass a stub. */
export type SshExec = (sshArgs: string[]) => Promise<{ stdout: string, stderr: string }>

const defaultSshExec: SshExec = async sshArgs => execFileAsync('ssh', sshArgs)

/**
 * A `Run` that executes `cmd args…` on a remote host over SSH. Non-zero remote exits
 * are returned as `{ code, stdout, stderr }` and do NOT reject — matching `defaultRun`
 * so the adapters/validation decide what a non-zero code means. No TTY is allocated.
 */
export function createSshRun(host: string, opts: SshRunOptions = {}, exec: SshExec = defaultSshExec): Run {
  return async (cmd, args) => {
    const sshArgs = buildSshArgs(host, opts, cmd, args)
    try {
      const { stdout, stderr } = await exec(sshArgs)
      return { code: 0, stdout, stderr }
    }
    catch (error) {
      const e = error as { code?: number, stdout?: string, stderr?: string }
      return {
        code: typeof e.code === 'number' ? e.code : 1,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? String(error),
      }
    }
  }
}
