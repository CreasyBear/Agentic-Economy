// Attribute only the immediate preceding user prompt's shown pick; acceptance means its first offered Run matched the pick.
import { components } from './_generated/api'
import { v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import {
  insertSelectionDecision,
  readRecentSelectionDecisions,
  recordSelectionDecision,
} from './lib/capabilityExecution/selectionDecisions'
import { serviceAssertion } from './serviceAssertion'

const selectionDecisionKind = v.union(
  v.literal('procure'),
  v.literal('registry_rerank'),
  v.literal('directory_rerank'),
  v.literal('chat_recommend'),
)
const selectionDecisionOffered = v.array(v.object({
  toolRef: v.string(),
  rank: v.number(),
  score: v.number(),
}))
const selectionDecisionFit = v.array(v.object({
  toolRef: v.string(),
  noul: v.optional(v.number()),
  score: v.optional(v.number()),
}))
const selectionDecisionValue = v.object({
  kind: selectionDecisionKind,
  accountRef: v.optional(v.string()),
  correlationId: v.string(),
  offered: selectionDecisionOffered,
  pickedToolRef: v.optional(v.string()),
  tier: v.string(),
  modelConfidence: v.optional(v.number()),
  fit: selectionDecisionFit,
  latencyMs: v.number(),
  costAud: v.optional(v.number()),
  threadId: v.optional(v.string()),
  promptMessageId: v.optional(v.string()),
  shown: v.optional(v.boolean()),
  ranToolRef: v.optional(v.string()),
  ranAt: v.optional(v.number()),
  createdAt: v.number(),
})

export const record = mutation({
  args: {
    kind: selectionDecisionKind,
    accountRef: v.optional(v.string()),
    correlationId: v.string(),
    offered: selectionDecisionOffered,
    pickedToolRef: v.optional(v.string()),
    tier: v.string(),
    modelConfidence: v.optional(v.number()),
    fit: selectionDecisionFit,
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

export const recordInternal = internalMutation({
  args: {
    kind: v.literal('chat_recommend'),
    accountRef: v.string(),
    correlationId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    offered: selectionDecisionOffered,
    pickedToolRef: v.optional(v.string()),
    tier: v.string(),
    modelConfidence: v.optional(v.number()),
    fit: selectionDecisionFit,
    latencyMs: v.number(),
    shown: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await insertSelectionDecision(ctx, args)
    return null
  },
})

export const markRunInternal = internalMutation({
  args: { threadId: v.string(), promptMessageId: v.string(), toolRef: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const history = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
      threadId: args.threadId,
      order: 'desc',
      paginationOpts: { cursor: null, numItems: 100 },
    })
    const runPrompt = history.page.find(message => message._id === args.promptMessageId)
    if (runPrompt?.threadId !== args.threadId || runPrompt.message?.role !== 'user') return null

    const sourcePrompt = history.page.find(message =>
      message.order < runPrompt.order && message.message?.role === 'user')
    if (sourcePrompt === undefined) return null
    const row = await ctx.db.query('toolSelectionDecisions')
      .withIndex('by_threadId_and_promptMessageId', (index) => index
        .eq('threadId', args.threadId).eq('promptMessageId', sourcePrompt._id))
      .unique()
    if (row?.kind === 'chat_recommend' && row.shown === true
      && row.ranToolRef === undefined && row.offered.some(item => item.toolRef === args.toolRef)) {
      await ctx.db.patch(row._id, { ranToolRef: args.toolRef, ranAt: Date.now() })
    }
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
      && kind !== 'registry_rerank' && kind !== 'directory_rerank'
      && kind !== 'chat_recommend') {
      return []
    }
    return await readRecentSelectionDecisions(ctx, {
      ...(kind === undefined ? {} : { kind }),
      limit: Math.min(Math.floor(args.limit), 500),
    })
  },
})
