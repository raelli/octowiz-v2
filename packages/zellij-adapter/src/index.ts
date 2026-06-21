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
