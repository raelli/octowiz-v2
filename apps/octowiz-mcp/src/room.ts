import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

export type ListRoots = () => Promise<{ roots: { uri: string, name?: string }[] }>

/** Resolve the repo root: MCP roots (switch-safe) → git toplevel from cwd → cwd. */
export async function resolveRepoRoot(listRoots: ListRoots | undefined, cwd: string): Promise<string> {
  if (listRoots) {
    try {
      const { roots } = await listRoots()
      const first = roots.find(r => r.uri.startsWith('file://'))
      if (first) return fileURLToPath(first.uri)
    }
    catch { /* fall through to git/cwd */ }
  }
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd })
    const top = stdout.trim()
    if (top) return top
  }
  catch { /* not a git repo */ }
  return cwd
}

export function makeLedgerResolver(opts: { listRoots?: ListRoots, cwd: string }): () => Promise<string> {
  // ponytail: cache repo root for the session; re-resolve on roots/list_changed when multi-project-per-session matters
  let cached: string | undefined
  return async () => {
    if (cached) return cached
    const root = await resolveRepoRoot(opts.listRoots, opts.cwd)
    cached = join(root, '.octowiz', 'ledger')
    return cached
  }
}
