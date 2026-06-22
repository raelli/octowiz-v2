// Octowiz doctrine guard — the ONLY custom code in this spike.
// Everything a static pattern can express lives in opencode.json `permission` (zero code).
// A plugin earns its place ONLY for rules that are conditional/stateful — here: a commit
// is allowed only AFTER validation has been recorded this cycle. Native permission
// patterns ("git commit *": "deny"/"ask") cannot express "deny UNLESS a marker exists".
import { existsSync } from "node:fs"
import { join } from "node:path"

export const DoctrineGuard = async ({ directory }) => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool !== "bash") return
    const cmd = String(output?.args?.command ?? "")
    if (/\bgit\s+commit\b/.test(cmd) && !existsSync(join(directory, ".octowiz", "validation-passed"))) {
      // Mirrors octowiz-v2 `doctrine.isMergeReady`: no merge/commit without passing validation.
      throw new Error(
        "OCTOWIZ DOCTRINE [validation-before-commit]: blocked. " +
        "Validation has not passed (no .octowiz/validation-passed marker). Run validation first.",
      )
    }
  },
})
