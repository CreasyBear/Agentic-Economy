import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { internalQuery } from './_generated/server'

export const MAX_WORK_TREE_EVENTS = 256
export const MAX_WORK_TREE_SNAPSHOT_BYTES = 524_288

const exactAmountArg = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const timingArg = v.object({
  certainty: v.union(v.literal('fixed'), v.literal('window'), v.literal('fog')),
  date: v.optional(v.string()),
  window: v.optional(v.object({ earliest: v.string(), latest: v.string() })),
  leadTimeDays: v.optional(v.number()),
})
const costArg = v.object({
  estimate: v.optional(exactAmountArg),
  committed: v.optional(exactAmountArg),
  envelope: v.optional(exactAmountArg),
})
const resourceArg = v.object({
  owner: v.union(v.literal('agent'), v.literal('human'), v.literal('business')),
  ownerRef: v.optional(v.string()),
  exclusive: v.optional(v.object({ startMs: v.number(), endMs: v.number() })),
})
const effortArg = v.object({ humanMinutes: v.optional(v.number()) })
const scopeArg = v.object({
  acceptance: v.union(v.literal('binary'), v.literal('criteria'), v.literal('judgement')),
  criteria: v.optional(v.array(v.object({
    criterionId: v.string(),
    label: v.string(),
    accepted: v.boolean(),
  }))),
})
const quoteArg = v.object({
  quoteRef: v.string(),
  observedAt: v.number(),
  expiresAt: v.number(),
  revision: v.number(),
  evidenceClass: v.union(v.literal('published_price'), v.literal('business_quote')),
})
const nodeDraftArg = v.object({
  format: v.optional(v.literal('ae.work-node:v1')),
  kind: v.union(v.literal('package'), v.literal('decision'), v.literal('task'), v.literal('study')),
  title: v.string(),
  description: v.optional(v.string()),
  status: v.optional(v.literal('fog')),
  dependsOn: v.optional(v.array(v.string())),
  priority: v.optional(v.number()),
  timing: v.optional(timingArg),
  cost: v.optional(costArg),
  resource: v.optional(resourceArg),
  effort: v.optional(effortArg),
  scope: v.optional(scopeArg),
  authorityRef: v.optional(v.string()),
  evidenceRefs: v.optional(v.array(v.string())),
  quote: v.optional(quoteArg),
})
const fenceArg = {
  expectedGeneration: v.number(),
  expectedRevision: v.number(),
  proposalDigest: v.string(),
  targetNodeId: v.string(),
} as const
const gardenerVerbArg = v.union(
  v.object({
    kind: v.literal('elaborate'),
    ...fenceArg,
    children: v.array(nodeDraftArg),
  }),
  v.object({
    kind: v.literal('study'),
    ...fenceArg,
    studyBrief: v.string(),
    criteriaFromCharter: v.array(v.string()),
  }),
  v.object({
    kind: v.literal('propose_decision'),
    ...fenceArg,
    options: v.array(v.object({ optionId: v.string(), label: v.string(), summary: v.string() })),
    recommendation: v.optional(v.string()),
  }),
)

const workTreeServiceAssertionArg = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  authorityMode: v.optional(v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))),
  issuedAt: v.number(),
  signature: v.string(),
})
const applyArgs = {
  projectId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  verb: gardenerVerbArg,
  guestAssertion: v.optional(v.string()),
  serviceAuth: v.optional(workTreeServiceAssertionArg),
}

const workTreeLineageArg = v.union(
  v.object({
    kind: v.literal('customer_request'),
    requestRef: v.string(),
    revision: v.number(),
    routeGenerationRef: v.string(),
    routeRef: v.string(),
  }),
  v.object({ kind: v.literal('standalone') }),
)
const workTreeCreateArgs = {
  idempotencyKey: v.string(),
  charterText: v.string(),
  lineage: workTreeLineageArg,
  guestAssertion: v.optional(v.string()),
  serviceAuth: v.optional(workTreeServiceAssertionArg),
}
const workTreeInspectArgs = {
  projectId: v.string(),
  guestAssertion: v.optional(v.string()),
  serviceAuth: v.optional(workTreeServiceAssertionArg),
}
const workTreeClaimArgs = {
  projectId: v.string(),
  idempotencyKey: v.string(),
  guestAssertion: v.string(),
}
const workTreeApprovalAuthorityArg = v.object({
  kind: v.literal('per_item'),
  amount: v.optional(exactAmountArg),
})
const workTreeStepUpArg = v.object({
  acknowledgedConsequence: v.literal(true),
  approvalKind: v.literal('per_item'),
  approvalRef: v.optional(v.string()),
  authority: v.optional(workTreeApprovalAuthorityArg),
})
const workTreeRepeatGrantArg = v.object({
  delegatedCredentialId: v.string(),
  occurrences: v.number(),
  perUseSpend: exactAmountArg,
  cumulativeSpend: exactAmountArg,
  perUseDataAllocations: v.number(),
  cumulativeDataAllocations: v.number(),
  validUntil: v.number(),
})
const workTreeDecisionArgs = {
  projectId: v.string(),
  nodeId: v.string(),
  kind: v.union(v.literal('lock'), v.literal('adjust'), v.literal('park')),
  expectedGeneration: v.number(),
  expectedRevision: v.number(),
  proposalDigest: v.string(),
  idempotencyKey: v.string(),
  stepUp: v.optional(workTreeStepUpArg),
  repeatGrant: v.optional(workTreeRepeatGrantArg),
  guestAssertion: v.optional(v.string()),
  serviceAuth: v.optional(workTreeServiceAssertionArg),
}

export const readTreeByProject = internalQuery({
  args: { projectId: v.string() },
  handler: async () => null,
})

/** Source-owned WorkTree initializer; identity is always derived from ctx.auth. */
export const create = mutationGeneric({
  args: workTreeCreateArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'work_tree_tables_unlisted', replayed: false }),
})

/** Owner-only WorkTree readback. */
export const inspect = queryGeneric({
  args: workTreeInspectArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'not_found' }),
})

/** Atomically binds a signed guest WorkTree to the authenticated Clerk owner. */
export const claim = mutationGeneric({
  args: workTreeClaimArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'work_tree_tables_unlisted', replayed: false }),
})


/** The sole mutation that changes a work-tree snapshot. */
export const apply = mutationGeneric({
  args: applyArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'work_tree_tables_unlisted', replayed: false }),
})
/** Source-owned durable decision mutation; authority and fences are checked in decideWorkTree. */
export const decide = mutationGeneric({
  args: workTreeDecisionArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'work_tree_tables_unlisted', replayed: false }),
})
