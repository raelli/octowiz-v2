# Design: octowiz + ÆLLI as native opencode capabilities (MCP + A2A)

**Date:** 2026-06-25
**Status:** Draft for review
**Phase:** 2 of 2 (Phase 1 — kraken skin + first-class agents — shipped to `~/.config/opencode`)

## Problem

octowiz and ÆLLI are surfaced to opencode only as **skills** (passive prompt-injection). The user wants them *first-class and always-on*: present in every session as part of the setup, callable as real tools, without manual invocation — but **not** auto-firing on every event. Phase 1 delivered the cosmetic/agent layer. Phase 2 delivers the **tool backbone**.

## Goals

- opencode can call octowiz room/ledger/doctrine/validation as **structured MCP tools** (not bash).
- opencode can reach the **live ÆLLI A2A agent network** as tools.
- Comes with the setup: registered in `~/.config/opencode` config, no per-session activation.
- Intentional use only: the model calls tools when relevant; **no event hooks**.
- **Never breaks daily opencode**: fail-open if the server or ÆLLI is unreachable.

## Non-goals

- No auto-firing `tool.execute` hooks (explicitly rejected by the user).
- No fork of the opencode TUI (logo stays compiled-in; theme already recolors it).
- No new domain logic — Phase 2 is **glue over existing seam-driven adapters**.

## Architecture

Two **orthogonal layers** (not a "combo" — each does one job):

- **MCP** = opencode's local tool surface. A stdio MCP server opencode spawns per session.
- **A2A** = the transport *inside* the ÆLLI tools, reaching `<gateway>/a2a/<agent>` via the existing `aelli-adapter`.

```
opencode session
   │  (stdio, MCP protocol)
   ▼
apps/octowiz-mcp  ──────────────► local: room-ledger / doctrine / validation / skill-runtime
   │                                     (FileLedgerStore at <repo>/.octowiz/ledger)
   └─ aelli_* tools ──(A2A JSON-RPC)──► https://llm.integrahub.de/a2a/<agent>
```

### New package: `apps/octowiz-mcp`

A stdio MCP server (official `@modelcontextprotocol/sdk`), composition-root only — it wires the **existing** packages, mirroring how `scripts/octowiz.ts` (the CLI) already composes them. No business logic lives here.

Reused packages (unchanged): `@octowiz/room-ledger`, `@octowiz/doctrine`, `@octowiz/validation`, `@octowiz/skill-runtime`, `@octowiz/aelli-adapter`, `@octowiz/schemas`, and (later) `@octowiz/github-adapter`.

## Session → room binding (resolved)

**Per-repo auto-room, resolved via MCP `roots`.** opencode advertises the MCP **roots** capability (`roots/list` confirmed in the binary), so the server asks the *client* for the workspace directory rather than guessing from its own process cwd:

1. `repoRoot` = first directory from MCP `roots/list`. **Fallbacks** (in order): server `cwd` → `git rev-parse --show-toplevel`. Re-resolve on the `roots/list_changed` notification so an in-session project switch rebinds correctly (a once-spawned server's cwd would *not* update — this is why roots, not cwd, is primary).
2. `ledgerDir` = `<repoRoot>/.octowiz/ledger` (matches the CLI default and existing `.octowiz/` dirs).
3. `roomId` = read from `<repoRoot>/.octowiz/room.json` if present; else **auto-create** a room (`room.created`, name = repo basename), persist the id to `room.json`, and add one participant for the opencode session (`kind: agent`, role `advisor`).

No room id is ever required from the model. Single-writer-per-room holds (one opencode session per repo checkout).

> **Verify during 2a:** confirm opencode actually answers `roots/list` for a local stdio server and what it returns (project dir vs launch dir). The fallback chain keeps the server correct even if roots is absent, but roots is the only switch-safe source — pin the behavior with an integration check before relying on it.

## Recording (resolved)

**Model-intentional milestones only.** Recording is the `octowiz_record` tool the model calls at meaningful points (task created, review recorded, validation result, escalation, advice, delivery). No hooks; nothing fires automatically. Matches "always on, not firing."

## Tools

### Local layer (no network)
| Tool | Wraps | Purpose |
|---|---|---|
| `octowiz_room_status` | `RoomLedger.getState` | Current room: participants, tasks, reviews, validations, escalations. |
| `octowiz_record` | `RoomLedger.record*` | Append a milestone event (type-discriminated: task/review/validation/escalation/advice/action). |
| `octowiz_validate` | `validation.runValidation` | Run lint/type-check/test, record a validation, advance task if passed. |
| `octowiz_merge_ready` | `doctrine.isMergeReady` | Doctrine gate for a task (validation + qualified non-self approval). |
| `octowiz_select_skills` | `skill-runtime.selectSkills` | Skills relevant to the current stage/context. |

### ÆLLI A2A layer (remote; transport = A2A JSON-RPC)
Backed by the 5 **live** agents found in the inventory (`aelli`, `aelli-router`, `aelli-engineering`, `aelli-dev-advisor`, `aelli-octowiz`):

| Tool | A2A agent | Purpose |
|---|---|---|
| `aelli_ask` | `aelli` | Orchestrator — route a natural-language task to the right specialist. |
| `aelli_route` | `aelli-router` | Complexity-tiered `generate→review→revise` (no self-approval). |
| `aelli_knowledge` | `aelli-engineering` | Semantic search over the GitHub/Confluence/Jira knowledge base. |
| `aelli_conflicts` | `aelli-dev-advisor` | Cross-session conflict / branch-drift / spec-deviation check. |
| `aelli_context` | `aelli-octowiz` | Model-tier-aware context bundle for an octowiz task. |
| `aelli_escalate` | `aelli` (gated) | `doctrine.shouldEscalate` → `buildEscalationRequest` → call ÆLLI → record escalation. Ties both layers. |
| `aelli_agents` *(optional)* | gateway `/v1/agents` | List live agents at runtime (discovery; "next level"). |

**Transport:** existing `createA2aAelliClient` (`message/stream`, handles the benign trailing `-32603` SSE error). Auth: `Authorization: Bearer ${LITELLM_API_KEY}`.

## Bug fix (found during inventory)

`packages/aelli-adapter/src/a2a-client.ts` defaults `agentName` to **`aelli-orchestrator`**, but ÆLLI registers the orchestrator as **`aelli`**. Verify against `GET /v1/agents` and correct the default (or confirm a gateway alias). In-scope for Phase 2 because every `aelli_*` tool depends on correct routing.

## Robustness (never break daily opencode)

- **Fail-open:** any tool error (unwritable ledger, missing env, ÆLLI unreachable/timeout) returns an MCP `isError` result with a readable message — the server never exits non-zero on a tool failure, so opencode stays fully usable with octowiz tools simply reporting unavailable.
- **No hard startup deps:** server boots even if `LITELLM_API_KEY` is unset; A2A tools then return "ÆLLI not configured" while local tools keep working.
- **Launch wrapper** (Phase 1) already uses `command opencode` (stable PATH symlink), so a broken server can never block launch.

## Deploy / build

- Build `apps/octowiz-mcp` to a self-contained `dist/index.js` (tsdown, ESM, Node bin).
- Register in `~/.config/opencode/opencode.jsonc`:
  ```jsonc
  "mcp": {
    "octowiz": {
      "type": "local",
      "command": ["node", "/Users/razu/Projects/octowiz-v2/apps/octowiz-mcp/dist/index.js"],
      "environment": {
        "LITELLM_API_KEY": "{env:LITELLM_API_KEY}",
        "LITELLM_BASE_URL": "https://llm.integrahub.de"
      }
    }
  }
  ```
- A setup/sync step (sibling to `sync-skills.sh`) builds the server and writes the absolute `command` path, so it "comes with the setup."

## Slash commands (deferred from Phase 1)

Now thin wrappers that invoke the MCP tools / agents (not bash): `/octowiz-status`, `/octowiz-validate`, `/octowiz-escalate`, `/aelli` (knowledge search). `~/.config/opencode/command/*.md`.

## Testing

Reuse the seam-driven pattern (every adapter injects `Run` / `AelliClient` / `LedgerStore`):
- Room resolution: cwd → repoRoot → ledgerDir → auto-create room (fake fs/run).
- Each tool handler against fake seams (fake ledger, fake `AelliClient`).
- Fail-open paths: unwritable ledger, missing key, A2A throw → `isError`, server stays alive.
- vitest, no new frameworks.

## Decomposition (build order)

- **2a — Local backbone.** Scaffold `apps/octowiz-mcp`, room resolution, the 5 local tools, fail-open, tests. Wire into opencode `mcp`. *(Shippable; no network.)*
- **2b — ÆLLI A2A layer.** `aelli_*` tools, fix the `aelli` naming bug, optional `aelli_agents` discovery, tests.
- **2c — Surface + setup.** Slash commands, build/sync script, docs. Update Phase 1 agents to mention the now-real tools.

## Build guardrails

- **Isolate before code.** Phase 2 creates `apps/octowiz-mcp` — do all octowiz-v2 code edits in a **git worktree**, never the shared checkout.
- **Branch, don't touch main.** Commit on a feature branch; open a PR. Merges to `main` are gated on the user's OK (no auto-merge).

## Open questions / risks

1. **MCP `roots` behavior** — confirm opencode answers `roots/list` for a local stdio server and returns the project dir (see 2a verify note). The fallback chain is safe, but roots is the only project-switch-safe source.
2. **Theme durability** — `"theme": "kraken"` vanished from `opencode.jsonc` once during Phase 1 (re-added). Confirm it survives an opencode restart *not* triggered by us; if opencode rewrites the config and drops it, investigate the config-write path (the binary has a `delete _.theme` branch).
3. **Tool-calling on `aelli-coding`** (Phase 1 `@aelli` agent model) — verify openai-compat tool_use works via the gateway; if flaky, route `@aelli` to a Claude model and keep ÆLLI reachable through the `aelli_*` tools instead.
4. **A2A name** — confirm `aelli` vs `aelli-orchestrator` against `/v1/agents` before wiring.
5. **`AELLI_INBOUND_SECRET`** — needed only for direct (non-gateway) calls; gateway path uses the LiteLLM key. Keep gateway-only for opencode.
