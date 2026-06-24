import type { TaskContext } from './index'

/**
 * Seam discipline: the driver depends on these INJECTED interfaces, never on
 * `createOpencode` directly. Production wires the real `@opencode-ai/sdk` via
 * `createDefaultEngine()` (a thin adapter, NOT exercised by unit tests); tests
 * pass a hand-written fake. This keeps the external effect (a real server +
 * network) at the edge so the lifecycle logic stays pure and testable.
 */
export interface OpencodeEngine {
  /** Start (or attach to) a server and return a handle to drive a session. */
  start: (opts: { signal?: AbortSignal }) => Promise<OpencodeSessionHandle>
}

export interface OpencodeSessionHandle {
  /** Readiness check against the running server. */
  health: () => Promise<{ healthy: boolean }>
  /** Create a session, returning its id. */
  createSession: (title: string) => Promise<{ id: string }>
  /** Send a prompt to a session and resolve the assistant text. */
  prompt: (sessionId: string, text: string) => Promise<{ text: string }>
  /** Shut the server/session down. Always called by the driver (try/finally). */
  shutdown: () => Promise<void>
}

/**
 * Reuse the title+description -> prompt convention from `startArgs`:
 * `title\n\ndescription` when a description is present, else just the title.
 */
function buildPrompt(task: TaskContext): string {
  return task.description
    ? `${task.title}\n\n${task.description}`
    : task.title
}

/**
 * Drive a full OpenCode session lifecycle through the injected seam:
 * start -> health -> create session -> prompt -> await -> shutdown.
 *
 * Fails CLOSED: a non-ready server, a failed prompt, or a lost/empty result
 * THROWS rather than looking like success. `shutdown()` is ALWAYS called once a
 * handle exists (try/finally), so the server is closed even on failure.
 */
export async function driveSession(
  engine: OpencodeEngine,
  task: TaskContext,
  opts: { signal?: AbortSignal } = {},
): Promise<{ text: string }> {
  // start() rejecting is a terminal failure with no handle to shut down — let it throw.
  const handle = await engine.start({ signal: opts.signal })

  try {
    const { healthy } = await handle.health()
    if (!healthy)
      throw new Error('opencode server is not healthy; refusing to drive session')

    const session = await handle.createSession(task.title)
    const result = await handle.prompt(session.id, buildPrompt(task))

    const text = result?.text
    if (typeof text !== 'string' || text.trim() === '')
      throw new Error('opencode prompt returned no assistant text; failing closed')

    return { text }
  }
  finally {
    await handle.shutdown()
  }
}

/**
 * Thin production adapter: wires the real `@opencode-ai/sdk` to the seam.
 * NOT exercised by unit tests (it touches a real server/network). Imported
 * lazily so unit tests never pull the SDK runtime.
 *
 * NOTE: the seam was designed against the API described in issue #84, but the
 * installed SDK (1.17.x) differs in two places (see the deviation report):
 *   - there is no `client.global.health()`; readiness is probed with
 *     `client.project.current()`, which only resolves once the server answers.
 *   - `session.prompt` resolves `{ info, parts }`, NOT an object with `.text`;
 *     assistant text is reassembled from the `text`-typed parts.
 */
export function createDefaultEngine(serverOptions: {
  hostname?: string
  port?: number
  timeout?: number
} = {}): OpencodeEngine {
  return {
    async start({ signal }) {
      const { createOpencode } = await import('@opencode-ai/sdk')
      const { client, server } = await createOpencode({ ...serverOptions, signal })

      return {
        async health() {
          // No dedicated health endpoint in this SDK; a successful
          // project.current() means the server is up and answering.
          try {
            const res = await client.project.current()
            return { healthy: Boolean(res.data) }
          }
          catch {
            return { healthy: false }
          }
        },
        async createSession(title) {
          const res = await client.session.create({ body: { title } })
          const id = res.data?.id
          if (!id)
            throw new Error('opencode session.create returned no session id')
          return { id }
        },
        async prompt(id, text) {
          const res = await client.session.prompt({
            path: { id },
            body: { parts: [{ type: 'text', text }] },
          })
          const parts = res.data?.parts ?? []
          const assistantText = parts
            .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
            .map(p => p.text)
            .join('')
          return { text: assistantText }
        },
        async shutdown() {
          server.close()
        },
      }
    },
  }
}
