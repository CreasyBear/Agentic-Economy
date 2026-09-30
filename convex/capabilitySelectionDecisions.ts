import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { readRecentSelectionDecisions, recordSelectionDecision } from './lib/capabilityExecution/selectionDecisions'
import { serviceAssertion } from './serviceAssertion'

const selectionDecisionKind = v.union(
  v.literal('procure'),
  v.literal('registry_rerank'),
  v.literal('directory_rerank'),
)
const selectionDecisionValue = v.object({
  kind: selectionDecisionKind,
  accountRef: v.optional(v.string()),
  correlationId: v.string(),
  offered: v.array(v.object({
    toolRef: v.string(),
    rank: v.number(),
    score: v.number(),
  })),
  pickedToolRef: v.optional(v.string()),
  tier: v.string(),
  modelConfidence: v.optional(v.number()),
  fit: v.array(v.object({
    toolRef: v.string(),
    noul: v.optional(v.number()),
    score: v.optional(v.number()),
  })),
  latencyMs: v.number(),
  costAud: v.optional(v.number()),
  createdAt: v.number(),
})

export const record = mutation({
  args: {
    kind: selectionDecisionKind,
    accountRef: v.optional(v.string()),
    correlationId: v.string(),
    offered: v.array(v.object({
      toolRef: v.string(),
      rank: v.number(),
      score: v.number(),
    })),
    pickedToolRef: v.optional(v.string()),
    tier: v.string(),
    modelConfidence: v.optional(v.number()),
    fit: v.array(v.object({
      toolRef: v.string(),
      noul: v.optional(v.number()),
      score: v.optional(v.number()),
    })),
    latencyMs: v.number(),
    costAud: v.optional(v.number()),
    serviceAuth: serviceAssertion,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordSelectionDecision(ctx, args)
    return null
  },
})

export const recent = query({
  args: { kind: v.optional(v.string()), limit: v.number() },
  returns: v.array(selectionDecisionValue),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.limit) || args.limit < 0) {
      throw new Error('capability_selection_decision_limit_invalid')
    }
    const kind = args.kind
    if (kind !== undefined && kind !== 'procure'
      && kind !== 'registry_rerank' && kind !== 'directory_rerank') {
      return []
    }
    return await readRecentSelectionDecisions(ctx, {
      ...(kind === undefined ? {} : { kind }),
      limit: Math.min(Math.floor(args.limit), 500),
    })
  },
})
