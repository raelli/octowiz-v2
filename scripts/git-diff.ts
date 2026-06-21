type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

/**
 * Capture the working-tree diff for `workdir` through the injected `Run` — used later as the
 * reviewer prompt. `git -C <workdir>` so the helper never has to chdir. A non-zero exit throws
 * with the captured stderr, matching the adapter convention; a clean exit returns stdout verbatim.
 */
export async function gitDiff(workdir: string, run: Run): Promise<string> {
  const result = await run('git', ['-C', workdir, 'diff'])
  if (result.code !== 0)
    throw new Error(`failed to capture diff for ${workdir}: exit ${result.code}${result.stderr ? `: ${result.stderr}` : ' (no stderr)'}`)
  return result.stdout
}
