import { z } from 'zod'

// The single source of truth for which skills exist is docs/skill-capability-audit.md.
// These are exactly the approved MVP skills — the registry data (skills/registry.json) must
// contain these and no others. Typing `id` as an enum gives "unknown/unapproved skill is
// rejected" for free at parse time.
export const APPROVED_SKILL_IDS = [
  'role-separation',
  'no-self-review',
  'adversarial-review',
  'validation-loop',
  'aelli-escalation',
  'ledger-recording',
  'sandbox-policy',
  'task-planning',
  'brainstorming',
  'test-driven-development',
  'systematic-debugging',
  'code-review',
  'github-delivery',
] as const

export type SkillId = (typeof APPROVED_SKILL_IDS)[number]

// Schema version of skills/registry.json. A mismatch is rejected outright (mirrors
// @octowiz/schemas' StoredLedgerEvent envelope). Only 0.1.0 exists today.
export const SKILL_REGISTRY_VERSION = '0.1.0' as const

export const SkillOriginSchema = z.enum(['native', 'external'])
export type SkillOrigin = z.infer<typeof SkillOriginSchema>

// `all` covers the cross-cutting native skills (ledger-recording, sandbox-policy); the
// others map to a single MVP workflow stage (plan → deliver).
export const WorkflowStageSchema = z.enum([
  'plan',
  'implement',
  'review',
  'validate',
  'escalate',
  'deliver',
  'all',
])
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>

// Trigger-signal fields. #25 validates PRESENCE only — the concrete vocabulary and the
// per-skill mapping are the matcher slice (see docs/skill-composition-strategy.md), so these
// are deliberately permissive `string[]` and are NOT matched on here. Each field is
// required-by-default (a missing field is a schema violation, so presence is enforced); the
// `.strict()` additionally rejects unknown signal keys.
export const SkillTriggersSchema = z.object({
  taskType: z.array(z.string()),
  repoStack: z.array(z.string()),
  role: z.array(z.string()),
  workflowStep: z.array(z.string()),
  filePaths: z.array(z.string()),
  validationFailures: z.array(z.string()),
  roomPolicy: z.array(z.string()),
}).strict()
export type SkillTriggers = z.infer<typeof SkillTriggersSchema>

export const SkillSchema = z.object({
  id: z.enum(APPROVED_SKILL_IDS),
  origin: SkillOriginSchema,
  workflowStage: WorkflowStageSchema,
  triggers: SkillTriggersSchema,
}).strict()
export type Skill = z.infer<typeof SkillSchema>

export const SkillRegistrySchema = z.object({
  schemaVersion: z.literal(SKILL_REGISTRY_VERSION),
  skills: z.array(SkillSchema),
}).strict()
export type SkillRegistry = z.infer<typeof SkillRegistrySchema>

/**
 * Validate already-parsed registry data against the schema and the approval invariants,
 * returning the typed registry. Throws an Error prefixed `invalid skill registry:` on any
 * violation so callers get a clear error rather than a raw ZodError or a partial load.
 *
 * Beyond the schema this enforces no duplicate ids — the enum rejects unknown/unapproved ids,
 * and the dedupe check rejects a registry that lists the same approved skill twice.
 */
export function parseRegistry(raw: unknown): SkillRegistry {
  const result = SkillRegistrySchema.safeParse(raw)
  if (!result.success)
    throw new Error(`invalid skill registry: ${z.prettifyError(result.error)}`)

  const seen = new Set<SkillId>()
  for (const skill of result.data.skills) {
    if (seen.has(skill.id))
      throw new Error(`invalid skill registry: duplicate skill id "${skill.id}"`)
    seen.add(skill.id)
  }

  return result.data
}
