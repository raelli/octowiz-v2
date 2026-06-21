export interface TaskContext {
  title: string
  description?: string
}

/**
 * Build the argv to launch OpenCode against a repo with task context. Pure builder —
 * the CLI spawns this via zellij.runInSession; nothing here spawns a process, and this
 * package does NOT depend on zellij-adapter (the CLI composes the two).
 *
 * ponytail: passes the task as a single non-interactive `run` prompt and the repo via
 * --cwd. The exact flag/prompt mechanism (arg vs env vs prompt file) is UNVERIFIED —
 * the `opencode` binary is not installed (spec slice 3 open question). This is the one
 * place that mechanism lives; swap the construction here once verified against the
 * real binary. Tests assert behaviour (repo path + task text present), not exact flags,
 * so confirming the real form won't churn them.
 */
export function startArgs(repoPath: string, taskContext: TaskContext): string[] {
  const prompt = taskContext.description
    ? `${taskContext.title}\n\n${taskContext.description}`
    : taskContext.title
  return ['opencode', 'run', '--cwd', repoPath, prompt]
}
