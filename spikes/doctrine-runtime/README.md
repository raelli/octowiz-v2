# Spike: Doctrine Runtime (enforcement)

Proves the core octowiz-v2 thesis on real mechanics: **coding doctrine becomes an enforced
mechanism in opencode, not a prompt the model may ignore** — and that this is mostly *native
config*, with custom code only where config genuinely can't reach. This is the thing the
Claude-Code octowiz plugin can never be ("a skill set"); it's what makes octowiz-v2 a product.

## What enforces what

| Doctrine rule | Mechanism | Custom code? |
|---|---|---|
| No direct `git push` | `opencode.json` → `permission.bash` `"git push *": "deny"` | **none** (native) |
| No self-review (reviewer can't edit) | `opencode.json` → `agent.reviewer.permission.edit: "deny"` | **none** (native) |
| Doctrine present every session | `AGENTS.md` (auto-loaded; persists across sessions) | **none** (native) |
| No commit until validation passes | `.opencode/plugins/doctrine-guard.js` (`tool.execute.before`) | **one small plugin** (conditional/stateful — native patterns can't express "deny unless marker exists") |

## Run

```sh
set -a; . ~/.config/integrahub/secrets.env; set +a   # LiteLLM key for the model
cd spikes/doctrine-runtime

# 1. plugin blocks commit (no validation marker yet)
opencode run "run exactly: git commit -m test"        # → blocked by doctrine-guard

# 2. validation recorded → commit allowed
mkdir -p .octowiz && touch .octowiz/validation-passed
opencode run "run exactly: git commit -m test"        # → allowed

# 3. native permission blocks push regardless
opencode run "run exactly: git push"                   # → denied by permission config
```

## Next layer (not in this spike)

- `tool.execute.after` → append actions to the room-ledger → feed aelli's experience→reflection
  →playbook loop → re-seed next session. That's the *persistence/learning* half; this spike is
  the *enforcement* half (the highest single product value).
- `instructions` field can pull shared/remote doctrine (e.g. the nuxt-monorepo doctrine) so a
  team's rules are centralized, not copied per repo.
