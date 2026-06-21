import type { SandboxProvider } from '@octowiz/sandbox-runtime'
import type { RoomState } from '@octowiz/schemas'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { parseArgs, promisify } from 'node:util'
import { startArgs } from '@octowiz/opencode-adapter'
import { FileLedgerStore, RoomLedger } from '@octowiz/room-ledger'
import { selectProvider } from '@octowiz/sandbox-runtime'
import { DEFAULT_CHECKS, runValidation } from '@octowiz/validation'
import { ensureSession, runInSession, sessionName } from '@octowiz/zellij-adapter'

type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

interface Deps {
  ledger: RoomLedger
  run: Run
  now: () => string
  provider: SandboxProvider
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
  const { ledger, run, now, provider } = deps
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      room: { type: 'string' },
      repo: { type: 'string' },
      task: { type: 'string' },
      title: { type: 'string' },
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
      // ponytail: drops the date prefix, keeping time-of-day+ms — so two rooms collide
      // only at the same millisecond-of-day on different days in one ledger (and a
      // collision fails closed: createRoom throws, no corruption). Swap for a ULID if it
      // ever bites. Kept short so `octowiz-<id>` stays under zellij's ~103-byte socket path.
      const id = `r${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
      return ledger.createRoom({ id, name, status: 'active', createdAt: at }, at)
    }
    case 'create-task': {
      const roomId = flag(values, 'room')
      const title = flag(values, 'title')
      const at = now()
      const id = `t${at.replace(/[^a-z0-9]/gi, '').slice(-10)}`
      return ledger.createTask({ id, roomId, title, status: 'open' }, at)
    }
    case 'start': {
      const roomId = flag(values, 'room')
      const repo = flag(values, 'repo')
      const name = sessionName(roomId)
      // Room lifecycle goes THROUGH the provider seam: create the sandbox and record it
      // before the zellij/opencode legs. M4 stayed host-first deliberately, so the legs
      // still launch on the host for now — wiring opencode to run inside the sandbox is a
      // later milestone; this slice proves the lifecycle depends on the interface.
      const sandbox = await provider.create(roomId, { workdir: repo })
      await ledger.recordSandboxStart(roomId, sandbox.provider, sandbox.id, now())
      await ensureSession(roomId, run)
      await ledger.recordSessionStart(roomId, 'zellij', name, now())
      await runInSession(roomId, startArgs(repo, { title: `Room ${roomId}` }), run)
      return ledger.recordSessionStart(roomId, 'opencode', name, now())
    }
    case 'validate': {
      const roomId = flag(values, 'room')
      const taskId = flag(values, 'task')
      // Fail fast: the checks are expensive (lint/type-check/test) and recordValidation
      // would reject an unknown task anyway, so verify the task exists first.
      const state = await ledger.getState(roomId)
      if (state === null || !state.tasks.some(t => t.id === taskId))
        throw new Error(`task "${taskId}" not found in room "${roomId}"`)
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
      throw new Error(`unknown subcommand: ${subcommand ?? '(none)'} (expected create-room | create-task | start | validate | status | up)`)
  }
}

// Entrypoint: only runs when invoked directly, not when imported by tests.
// pathToFileURL handles paths with spaces/special chars that a raw `file://` would not.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2)
  const ledger = new RoomLedger(new FileLedgerStore('.octowiz/ledger'))
  const provider = selectProvider('auto', defaultRun)
  runCli(argv, { ledger, run: defaultRun, now: () => new Date().toISOString(), provider })
    .then((state) => {
      // `status` already printed its projection; for mutating commands, echo the room id
      // so the human has the handle for follow-up commands (status/validate/start).
      if (argv[0] !== 'status')
        console.log(state.room.id)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
