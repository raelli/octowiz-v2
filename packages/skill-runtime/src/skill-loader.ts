import type { Skill } from './skill-registry'
import { readFile } from 'node:fs/promises'
import { parseRegistry } from './skill-registry'

/**
 * The exec-seam every registry read goes through: read a file's UTF-8 text by path. Injected
 * so the loader is unit-testable without touching the real disk (mirrors @octowiz/sandbox-runtime's
 * `Run`). The real `defaultReadFile` is wired at the composition root.
 */
export type ReadFile = (path: string) => Promise<string>

export const defaultReadFile: ReadFile = path => readFile(path, 'utf8')

/**
 * Load the skill registry from `path` through the injected reader, validate it, and return the
 * approved skills it exposes. A malformed (unparseable JSON), schema-violating, or unapproved
 * registry is rejected with a clear `invalid skill registry:` error rather than partially loading.
 *
 * Strictly load + validate + expose: this does NOT match triggers, compose, resolve conflicts,
 * or record to the ledger (see docs/skill-composition-strategy.md).
 */
export async function loadApprovedSkills(read: ReadFile, path: string): Promise<Skill[]> {
  const text = await read(path)

  let raw: unknown
  try {
    raw = JSON.parse(text)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`invalid skill registry: not valid JSON: ${message}`)
  }

  return parseRegistry(raw).skills
}
