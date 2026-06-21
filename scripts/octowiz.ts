import type { RoomState } from '@octowiz/schemas'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { parseArgs, promisify } from 'node:util'
import { startArgs } from '@octowiz/opencode-adapter'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { DEFAULT_CHECKS, runValidation } from '@octowiz/validation'
import { ensureSession, runInSession, sessionName } from '@octowiz/zellij-adapter'

type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

interface Deps {
  ledger: RoomLedger
  run: Run
  now: () => string
}

const execFileAsync = promisify(execFile)

/**
 * The one real exec seam: wrap node:child_process. A non-zero exit must NOT reject —
 * execFile rejects on non-zero, so map that back into our { code, stdout, stderr } shape
 * (the adapters/validation decide what a non-zero code means).
 */
export const defaultRun: Run = async (cmd, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args)
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

function flag(values: Record<string, unknown>, name: string): string {
  const v = values[name]
  if (typeof v !== 'string' || v === '')
    throw new Error(`missing required --${name}`)
  return v
}

export async function runCli(argv: string[], deps: Deps): Promise<RoomState> {
  const [subcommand, ...rest] = argv
  const { ledger, run, now } = deps
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      room: { type: 'string' },
      repo: { type: 'string' },
      task: { type: 'string' },
    },
    allowPositionals: false,
  })

  switch (subcommand) {
    case 'create-room': {
      const name = flag(values, 'name')
      const at = now()
      // Keep the id short: sessionName is `octowiz-<id>`, and zellij's IPC socket path
      // (socket dir + name) must stay under ~103 bytes — a long id overflows it. Derive
      // a compact, path-safe token from the timestamp.
      // ponytail: last-10 digits of the timestamp. Collides only on two rooms created in
      // the same 10⁻… window of the same ledger — swap for a ULID if that ever bites.
      const id = `r${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
      return ledger.createRoom({ id, name, status: 'active', createdAt: at }, at)
    }
    case 'start': {
      const roomId = flag(values, 'room')
      const repo = flag(values, 'repo')
      const name = sessionName(roomId)
      await ensureSession(roomId, run)
      await ledger.recordSessionStart(roomId, 'zellij', name, now())
      await runInSession(roomId, startArgs(repo, { title: `Room ${roomId}` }), run)
      return ledger.recordSessionStart(roomId, 'opencode', name, now())
    }
    case 'validate': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      const validation = await runValidation(taskId, DEFAULT_CHECKS, run, now())
      return ledger.recordValidation(roomId, validation, now())
    }
    case 'status': {
      const roomId = flag(values, 'room')
      const state = await ledger.getState(roomId)
      if (state === null)
        throw new Error(`room "${roomId}" not found`)
      console.log(JSON.stringify(state, null, 2))
      return state
    }
    case 'up': {
      const name = flag(values, 'name')
      const repo = flag(values, 'repo')
      const created = await runCli(['create-room', '--name', name], deps)
      return runCli(['start', '--room', created.room.id, '--repo', repo], deps)
    }
    default:
      throw new Error(`unknown subcommand: ${subcommand ?? '(none)'}`)
  }
}

// Entrypoint: only runs when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const ledger = new RoomLedger(new FileLedgerStore('.octowiz/ledger'))
  runCli(process.argv.slice(2), { ledger, run: defaultRun, now: () => new Date().toISOString() })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
