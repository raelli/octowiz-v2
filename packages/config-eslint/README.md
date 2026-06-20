# @octowiz/config-eslint

Octowiz ESLint flat config: `@antfu/eslint-config` plus import-boundary rules.

Usage (repo root `eslint.config.mjs`):

```js
import octowiz from '@octowiz/config-eslint'
export default octowiz()
```

Boundary rule: files under `packages/**` may not import from `apps/**` or `layers/**`.
The structural layer (pnpm refusing undeclared workspace deps) is the first line of
defence; this lint rule catches relative-path escapes.
