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
