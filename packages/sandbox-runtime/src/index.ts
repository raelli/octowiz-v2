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
 * Container provider backed by a Docker-CLI-compatible binary. podman and docker share the
 * exact `run -d --name … <image> <keep-alive>` / `rm -f <id>` argv, so one implementation
 * serves both — the binary name is the only difference. Shell-out goes through an injected
 * `Run` so this is unit-testable without a runtime; the real `defaultRun` is wired at the
 * composition root. (podman is rootless by default as non-root; docker is not.)
 */
function createContainerProvider(binary: 'podman' | 'docker', run: Run): SandboxProvider {
  return {
    name: binary,
    async create(roomId, opts) {
      const args = ['run', '-d', '--name', sandboxName(roomId)]
      if (opts?.workdir !== undefined)
        args.push('--workdir', opts.workdir)
      args.push(opts?.image ?? DEFAULT_IMAGE, ...KEEP_ALIVE)
      const r = await run(binary, args)
      if (r.code !== 0)
        throw new Error(`${binary} create failed for room ${roomId}: ${r.stderr}`)
      // `run -d` prints the container id on its own line; take the last non-empty line so a
      // stray warning on stdout cannot corrupt the id, and fail loudly on empty output rather
      // than hand back a useless handle that only breaks at destroy time.
      const id = r.stdout.trim().split('\n').map(l => l.trim()).filter(Boolean).at(-1) ?? ''
      if (id === '')
        throw new Error(`${binary} create for room ${roomId} returned no container id`)
      return { provider: binary, id, roomId }
    },
    async destroy(handle) {
      // Guard against a foreign handle being routed to the wrong backend — destroying by id
      // alone would otherwise silently hit (or miss) a container in a different runtime.
      if (handle.provider !== binary)
        throw new Error(`${binary} provider cannot destroy a "${handle.provider}" sandbox`)
      const r = await run(binary, ['rm', '-f', handle.id])
      if (r.code !== 0)
        throw new Error(`${binary} destroy failed for ${handle.id}: ${r.stderr}`)
    },
  }
}

export const createPodmanProvider = (run: Run): SandboxProvider => createContainerProvider('podman', run)
export const createDockerProvider = (run: Run): SandboxProvider => createContainerProvider('docker', run)

export type ProviderName = 'podman' | 'docker' | 'auto'

/**
 * Pick a sandbox provider so the room lifecycle is not bound to one backend. An explicit
 * name forces that provider. ponytail: `auto` resolves to podman — the MVP rootless default
 * — without probing the host (that needs a real exec at the composition root). When host
 * probing is wanted, run `<bin> info` (daemon-reachable, as the gated smoke does) there and
 * pass the winning name explicitly; a `--provider` CLI flag can follow when M6 needs it.
 */
export function selectProvider(name: ProviderName, run: Run): SandboxProvider {
  return name === 'docker' ? createDockerProvider(run) : createPodmanProvider(run)
}
