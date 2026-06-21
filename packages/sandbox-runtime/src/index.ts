export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

/** Container name for a room's sandbox. Room-scoped; `octowiz-sbx-r1` ≠ `octowiz-sbx-r10`. */
export function sandboxName(roomId: string): string {
  return `octowiz-sbx-${roomId}`
}

export interface SandboxOptions {
  // ponytail: image defaults to a minimal base; swap for a real dev image (or make it
  // room-config-driven) when agents need toolchains. Out of M5 scope.
  image?: string
  // Working directory inside the container. Mounting the repo is M5b+, not here.
  workdir?: string
}

/** Opaque handle to a created sandbox — enough to destroy it. */
export interface SandboxHandle {
  provider: string
  id: string
  roomId: string
}

/**
 * The seam every backend implements (podman/docker now; kata/firecracker/gvisor later).
 * Narrow by design — M5 is create + destroy only. Freeze/snapshot, secret injection,
 * network/resource boundaries, and artifact collection are deliberately NOT here.
 */
export interface SandboxProvider {
  readonly name: string
  create: (roomId: string, opts?: SandboxOptions) => Promise<SandboxHandle>
  destroy: (handle: SandboxHandle) => Promise<void>
}

const DEFAULT_IMAGE = 'docker.io/library/alpine:latest'

// ponytail: keep-alive so the detached container idles instead of exiting immediately.
// `sleep infinity` is the conventional idiom (GNU + modern BusyBox); whether the DEFAULT_IMAGE's
// sleep accepts it is verified by the M5c gated real-container smoke — flip this one constant
// there if a concrete image rejects it. One place, same pattern as the opencode argv.
const KEEP_ALIVE = ['sleep', 'infinity']

/**
 * Rootless container provider backed by `podman` (rootless is podman's default when run as
 * a non-root user — no extra flag needed). Shell-out goes through an injected `Run` so this
 * is unit-testable without a runtime; the real `defaultRun` is wired at the composition root.
 */
export function createPodmanProvider(run: Run): SandboxProvider {
  return {
    name: 'podman',
    async create(roomId, opts) {
      const args = ['run', '-d', '--name', sandboxName(roomId)]
      if (opts?.workdir !== undefined)
        args.push('--workdir', opts.workdir)
      // ponytail: `sleep infinity` keeps the container alive as an idle sandbox. The real
      // keep-alive against a concrete image is exercised by the M5c gated smoke; adjust here
      // if the chosen image lacks it (single place — same pattern as the opencode argv).
      args.push(opts?.image ?? DEFAULT_IMAGE, ...KEEP_ALIVE)
      const r = await run('podman', args)
      if (r.code !== 0)
        throw new Error(`podman create failed for room ${roomId}: ${r.stderr}`)
      // `run -d` prints the container id on its own line; take the last non-empty line so a
      // stray warning on stdout cannot corrupt the id, and fail loudly on empty output rather
      // than hand back a useless handle that only breaks at destroy time.
      const id = r.stdout.trim().split('\n').map(l => l.trim()).filter(Boolean).at(-1) ?? ''
      if (id === '')
        throw new Error(`podman create for room ${roomId} returned no container id`)
      return { provider: 'podman', id, roomId }
    },
    async destroy(handle) {
      // Guard against a foreign handle being routed here once a factory/multi-provider path
      // exists (M5c) — destroying by id alone would otherwise hit the wrong backend silently.
      if (handle.provider !== 'podman')
        throw new Error(`podman provider cannot destroy a "${handle.provider}" sandbox`)
      const r = await run('podman', ['rm', '-f', handle.id])
      if (r.code !== 0)
        throw new Error(`podman destroy failed for ${handle.id}: ${r.stderr}`)
    },
  }
}
