import antfu from '@antfu/eslint-config'

/**
 * Octowiz ESLint flat-config factory.
 *
 * Wraps @antfu/eslint-config and adds import-boundary rules:
 * packages/* may not import from apps/* or layers/*.
 *
 * @param {Parameters<typeof antfu>[0]} [options] antfu options override
 * @param {...any} userConfigs extra flat-config objects appended last
 */
export default function octowiz(options = {}, ...userConfigs) {
  return antfu(
    {
      type: 'lib',
      // Force TypeScript on. antfu auto-detects TS via isPackageExists('typescript'),
      // which returns false at the monorepo root (typescript is only a sub-package
      // devDep) and would make antfu globally ignore every .ts file — silently turning
      // the boundary rule below into a no-op. Pinning it true keeps .ts files linted.
      typescript: true,
      jsonc: false,
      yaml: false,
      markdown: false,
      ...options,
    },
    {
      files: ['packages/**/*.{ts,js,vue}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['**/apps/**', '**/layers/**'],
              message: 'packages/* must not import from apps/* or layers/* (see docs/monorepo.md).',
            },
          ],
        }],
      },
    },
    ...userConfigs,
  )
}
