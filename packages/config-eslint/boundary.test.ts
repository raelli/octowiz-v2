import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import octowiz from './index.js'

async function lint(code: string, filePath: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: await octowiz(),
    cwd: process.cwd(),
  })
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
}

describe('import boundaries', () => {
  it('rejects packages importing from apps/*', async () => {
    const messages = await lint(
      'import "../../apps/octowiz-web"\n',
      'packages/schemas/src/probe.ts',
    )
    expect(messages.some(m => m.ruleId === 'no-restricted-imports')).toBe(true)
  })

  it('allows packages importing other workspace packages', async () => {
    const messages = await lint(
      'import { SCHEMAS_VERSION } from "@octowiz/schemas"\nconsole.log(SCHEMAS_VERSION)\n',
      'packages/doctrine/src/probe.ts',
    )
    expect(messages.some(m => m.ruleId === 'no-restricted-imports')).toBe(false)
  })
})
