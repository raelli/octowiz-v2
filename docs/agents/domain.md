# Domain Docs
How engineering skills should consume this repo's domain documentation when exploring the codebase.
This repo currently uses repository-level docs under `docs/`.
## Before exploring, read these
- **`docs/architecture.md`** for system architecture and doctrine runtime direction.
- **`docs/product-direction.md`** for product boundary and scope.
- **`docs/monorepo.md`** for workspace layout and import boundaries.
- **`docs/apps-and-layers.md`** for current app/layer structure.
- **`docs/packages.md`** for current package inventory and responsibilities.
- **`docs/mvp.md`** for milestone framing and delivery expectations.
If any of these files are missing, proceed with code-first inspection and note the documentation gap in your output.
## File structure
Current domain-docs layout:
```
/
├── docs/
│   ├── architecture.md
│   ├── product-direction.md
│   ├── monorepo.md
│   ├── apps-and-layers.md
│   ├── packages.md
│   └── mvp.md
└── ...
```
> Note: octowiz-v2 is a pnpm monorepo (apps / layers / packages). If domain language diverges by package, introduce an explicit context map in `docs/` and point each package to its source-of-truth domain doc.
## Use canonical vocabulary
When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, or a test name), prefer terminology used in the docs listed above.
If the concept you need is not documented yet, call out the gap explicitly.
## Flag doc conflicts
If your output contradicts current domain docs, surface it explicitly rather than silently overriding:
> _Contradicts `docs/architecture.md` on room-ledger behavior — worth revisiting because..._
