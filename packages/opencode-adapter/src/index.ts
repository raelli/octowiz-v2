export interface TaskContext {
  title: string
  description?: string
}

export type {
  OpencodeEngine,
  OpencodeSessionHandle,
} from './driver'
export {
  createDefaultEngine,
  driveSession,
} from './driver'

/**
 * Build the argv to launch OpenCode against a repo with task context. Pure builder —
 * the CLI spawns this via zellij.runInSession; nothing here spawns a process, and this
 * package does NOT depend on zellij-adapter (the CLI composes the two).
 *
 * ponytail: passes the task as a single non-interactive `run` prompt (positional
 * [message..]) and the repo via --dir. Confirmed against the SST opencode CLI docs
 * (opencode.ai/docs/cli: `opencode run [message..]`, working-dir flag is `--dir`).
 * Still UNVERIFIED against the real binary (not installed) — the OCTOWIZ_SMOKE leg
 * closes that. This is the one place the mechanism lives; tests assert behaviour
 * (repo path + task text present), not exact flags.
 */
export function startArgs(repoPath: string, taskContext: TaskContext): string[] {
  const prompt = taskContext.description
    ? `${taskContext.title}\n\n${taskContext.description}`
    : taskContext.title
  return ['opencode', 'run', '--dir', repoPath, prompt]
}
