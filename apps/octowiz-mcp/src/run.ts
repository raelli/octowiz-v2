import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type Run = (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>

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
