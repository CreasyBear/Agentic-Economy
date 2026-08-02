import { z } from 'zod'
export const workTreeLineageSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('customer_request'),
    requestRef: z.string().trim().min(1).max(200),
    revision: z.number().int().min(1),
    routeGenerationRef: z.string().trim().min(1).max(300),
    routeRef: z.string().trim().min(1).max(300),
  }),
  z.strictObject({
    kind: z.literal('standalone'),
  }),
])
export type WorkTreeLineage = z.infer<typeof workTreeLineageSchema>

/**
 * T26 — the work-node contract every framework module consumes.
 *
 * Shape lineage (see ticket T26 "Input assets"): identity/hierarchy/relations/
 * status taxonomy adopted from the Linear schema family (`ln-dev7/circle` MIT
 * mock-data + `linear/linear` SDK types). The five-dimension fields, fog
 * lifecycle, cost envelope, authority/evidence/freshness and generation fences
 * are the recorded adoption-search failure — AE-only, hand-rolled by decision.
 *
 * Rollup algebra lives in `rollup.ts` (pure); dependency validation is
 * graphology; timing math is the ported CPM engine; resource conflicts are
 * `@flatten-js/interval-tree`; calendar math is `date-fns` v4.
 */

export const WORK_NODE_FORMAT = 'ae.work-node:v1' as const

/** Elaboration bounds — rolling wave; enforced by the kernel, never the model. */
export const MAX_CHILDREN_PER_ELABORATION = 8
export const MAX_TREE_DEPTH = 5
export const MAX_NODES_PER_TREE = 128

export const workNodeKindSchema = z.enum(['package', 'decision', 'task', 'study'])
export type WorkNodeKind = z.infer<typeof workNodeKindSchema>

/**
 * Status taxonomy (ADAPT of Linear WorkflowState types):
 * `fog` — placeholder beyond the rolling wave; dimensions may be absent.
 * `queued` — elaborated, not yet actionable (dependencies or window not open).
 * `ready` — actionable now; may surface a decision to the inbox.
 * `studying` — a Study is running against this node.
 * `locked` — the person committed it (lock exits the decision inbox).
 * `done` / `cancelled` — terminal (Linear completed/canceled).
 */
export const workNodeStatusSchema = z.enum([
  'fog', 'queued', 'ready', 'studying', 'locked', 'done', 'cancelled',
])
export type WorkNodeStatus = z.infer<typeof workNodeStatusSchema>

export const WORK_NODE_STATUS_TRANSITIONS: Readonly<Record<WorkNodeStatus, readonly WorkNodeStatus[]>> = {
  fog: ['queued', 'ready', 'cancelled'],
  queued: ['ready', 'studying', 'cancelled'],
  ready: ['studying', 'locked', 'queued', 'cancelled'],
  studying: ['ready', 'queued', 'cancelled'],
  locked: ['done', 'cancelled'],
  done: [],
  cancelled: [],
}

/** timing — lead time in business days, a window, or an exact date; certainty is explicit. */
export const workNodeTimingSchema = z.strictObject({
  certainty: z.enum(['fixed', 'window', 'fog']),
  /** ISO date (yyyy-mm-dd) when certainty === 'fixed'. */
  date: z.string().optional(),
  /** Inclusive ISO-date window when certainty === 'window'. */
  window: z.strictObject({ earliest: z.string(), latest: z.string() }).optional(),
  /** Business-day lead time consumed by CPM scheduling. */
  leadTimeDays: z.number().int().min(0).optional(),
})

/** cost — minor units; estimate vs committed never merge; envelope is the authority ceiling. */
export const workNodeCostSchema = z.strictObject({
  currency: z.string().length(3),
  estimateMinor: z.number().int().min(0).optional(),
  committedMinor: z.number().int().min(0).optional(),
  /** Spend ceiling granted for this subtree; rollup flags any breach. */
  envelopeMinor: z.number().int().min(0).optional(),
})

/** resources — who carries the node; exclusive interval for conflict detection (half-open [start, end)). */
export const workNodeResourceSchema = z.strictObject({
  owner: z.enum(['agent', 'human', 'business']),
  ownerRef: z.string().optional(),
  exclusive: z.strictObject({ startMs: z.number().int(), endMs: z.number().int() }).optional(),
})

/** effort — human-minutes is the scarce currency (attention budget), never complexity points. */
export const workNodeEffortSchema = z.strictObject({
  humanMinutes: z.number().int().min(0).optional(),
})

/** scope — what "done" means; criteria carry individual acceptance state. */
export const workNodeScopeSchema = z.strictObject({
  acceptance: z.enum(['binary', 'criteria', 'judgement']),
  criteria: z.array(z.strictObject({
    criterionId: z.string().min(1),
    label: z.string().min(1),
    accepted: z.boolean(),
  })).max(16).optional(),
})

/** Quote freshness — evidence-class rule: stale quotes never roll up as current. */
export const workNodeQuoteSchema = z.strictObject({
  quoteRef: z.string().min(1),
  observedAt: z.number().int(),
  expiresAt: z.number().int(),
  revision: z.number().int().min(1),
  evidenceClass: z.enum(['ae_sandbox_provider', 'published_price', 'business_quote']),
})

export const workNodeSchema = z.strictObject({
  format: z.literal(WORK_NODE_FORMAT),
  nodeId: z.string().min(1),
  kind: workNodeKindSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
  status: workNodeStatusSchema,
  /** Bundle-under-Customer-Request: root's parentId is undefined. */
  parentId: z.string().optional(),
  /** Directional `blocks` edges (Linear IssueRelationType) — nodeIds this node depends on. */
  dependsOn: z.array(z.string()).max(16),
  priority: z.number().int().min(0).max(4),
  timing: workNodeTimingSchema.optional(),
  cost: workNodeCostSchema.optional(),
  resource: workNodeResourceSchema.optional(),
  effort: workNodeEffortSchema.optional(),
  scope: workNodeScopeSchema.optional(),
  authorityRef: z.string().optional(),
  evidenceRefs: z.array(z.string()).max(32),
  quote: workNodeQuoteSchema.optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).superRefine((node, ctx) => {
  if (node.status !== 'fog' && node.timing === undefined && node.kind !== 'decision') {
    ctx.addIssue({ code: 'custom', message: 'non_fog_node_requires_timing' })
  }
  if (node.timing?.certainty === 'fixed' && node.timing.date === undefined) {
    ctx.addIssue({ code: 'custom', message: 'fixed_timing_requires_date' })
  }
  if (node.timing?.certainty === 'window' && node.timing.window === undefined) {
    ctx.addIssue({ code: 'custom', message: 'window_timing_requires_window' })
  }
  if (node.scope?.acceptance === 'criteria' && (node.scope.criteria === undefined || node.scope.criteria.length === 0)) {
    ctx.addIssue({ code: 'custom', message: 'criteria_acceptance_requires_criteria' })
  }
  if (node.resource?.exclusive !== undefined && node.resource.exclusive.endMs <= node.resource.exclusive.startMs) {
    ctx.addIssue({ code: 'custom', message: 'exclusive_interval_empty' })
  }
})
export type WorkNode = z.infer<typeof workNodeSchema>

/** The tree aggregate — generation/revision fences align with the frozen spine exit contract. */
export const workTreeSchema = z.strictObject({
  format: z.literal('ae.work-tree:v1'),
  treeId: z.string().min(1),
  /** Customer Request / project the Bundle hangs under. */
  projectId: z.string().min(1),
  generation: z.number().int().min(1),
  revision: z.number().int().min(1),
  charterText: z.string().min(1).max(4_000),
  nodes: z.array(workNodeSchema).max(MAX_NODES_PER_TREE),
})
export type WorkTree = z.infer<typeof workTreeSchema>

/**
 * Frontier rule (rolling wave): a fog node is elaborable only when every
 * ancestor is non-fog and its parent is `locked` or `ready`. Selection order
 * vendored from Task Master AI `find-next-task.js`.
 */
export function isElaborationFrontier(tree: WorkTree, nodeId: string): boolean {
  const byId = new Map(tree.nodes.map((node) => [node.nodeId, node]))
  const node = byId.get(nodeId)
  if (node === undefined || node.status !== 'fog') return false
  let parentId = node.parentId
  let parent = parentId === undefined ? undefined : byId.get(parentId)
  if (parentId !== undefined && (parent === undefined || (parent.status !== 'locked' && parent.status !== 'ready'))) return false
  while (parentId !== undefined) {
    const ancestor = byId.get(parentId)
    if (ancestor === undefined || ancestor.status === 'fog') return false
    parentId = ancestor.parentId
  }
  return true
}
