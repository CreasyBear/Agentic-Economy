import { TableAggregate } from '@convex-dev/aggregate'
import { v } from 'convex/values'

import { isMarketCategoryId } from '../src/modules/market/listing-evidence'
import { isPublicToolRef } from '../src/modules/common/tool-ref'
import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'

const MAX_TOOL_REFS = 20
const MAX_LATENCY_SAMPLES = 48

const ratingAggregate = new TableAggregate<{
  Namespace: string
  Key: number
  DataModel: DataModel
  TableName: 'marketToolRatings'
}>(components.marketToolRatings, {
  namespace: (doc) => doc.toolRef,
  sortKey: (doc) => doc.createdAt,
  sumValue: (doc) => doc.score,
})

const toolEvidenceAggregate = new TableAggregate<{
  Namespace: string
  Key: number
  DataModel: DataModel
  TableName: 'marketEvidenceFacts'
}>(components.marketOperationEvidence, {
  namespace: (doc) => evidenceNamespace(doc.kind, doc.toolRef),
  sortKey: (doc) => doc.occurredAt,
})

const listingEvidenceValue = v.object({
  toolRef: v.string(),
  categoryId: v.optional(v.string()),
  ratingCount: v.number(),
  ratingSum: v.number(),
  completedCalls: v.number(),
  qualifiedUses: v.number(),
  latencySamplesMs: v.array(v.number()),
})

export const read = query({
  args: {
    toolRefs: v.array(v.string()),
    since: v.number(),
  },
  returns: v.array(listingEvidenceValue),
  handler: async (ctx, args) => {
    const toolRefs = uniqueToolRefs(args.toolRefs)
    if (toolRefs.length > MAX_TOOL_REFS) {
      throw new Error('market_listing_evidence_tool_limit_exceeded')
    }
    return await Promise.all(
      toolRefs.map((toolRef) => readToolEvidence(ctx, toolRef, args.since)),
    )
  },
})

export const rate = mutation({
  args: {
    toolRef: v.string(),
    score: v.number(),
    review: v.optional(v.string()),
  },
  returns: v.object({ kind: v.literal('recorded'), toolRef: v.string() }),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      throw new Error('market_rating_authentication_required')
    }
    if (!Number.isInteger(args.score) || args.score < 1 || args.score > 5) {
      throw new Error('market_rating_score_invalid')
    }
    if (!isPublicToolRef(args.toolRef)) {
      throw new Error('market_rating_tool_ref_invalid')
    }
    const review = args.review?.trim()
    if (review !== undefined && (review.length === 0 || review.length > 2_000)) {
      throw new Error('market_rating_review_invalid')
    }
    const now = Date.now()
    const existing = await ctx.db.query('marketToolRatings')
      .withIndex('by_toolRef_and_reviewerRef', (index) => (
        index.eq('toolRef', args.toolRef).eq('reviewerRef', actor.canonicalPrincipalRef)
      ))
      .unique()
    if (existing === null) {
      const id = await ctx.db.insert('marketToolRatings', {
        toolRef: args.toolRef,
        reviewerRef: actor.canonicalPrincipalRef,
        score: args.score,
        ...(review === undefined ? {} : { review }),
        createdAt: now,
        updatedAt: now,
      })
      const row = await ctx.db.get(id)
      if (row === null) throw new Error('market_rating_missing_after_insert')
      await ratingAggregate.insert(ctx, row)
    } else {
      const { review: _previousReview, ...existingWithoutReview } = existing
      const replacement = {
        ...existingWithoutReview,
        score: args.score,
        ...(review === undefined ? {} : { review }),
        updatedAt: now,
      }
      await ctx.db.replace(existing._id, replacement)
      const updated = await ctx.db.get(existing._id)
      if (updated === null) throw new Error('market_rating_missing_after_replace')
      await ratingAggregate.replace(ctx, existing, updated)
    }
    return { kind: 'recorded' as const, toolRef: args.toolRef }
  },
})

export const assignCategory = internalMutation({
  args: {
    toolRef: v.string(),
    categoryId: v.string(),
    assignedBy: v.string(),
    assignedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isPublicToolRef(args.toolRef) || !isMarketCategoryId(args.categoryId)) {
      throw new Error('market_category_assignment_invalid')
    }
    const existing = await ctx.db.query('marketToolCategories')
      .withIndex('by_toolRef', (index) => index.eq('toolRef', args.toolRef))
      .unique()
    if (existing === null) await ctx.db.insert('marketToolCategories', args)
    else await ctx.db.replace(existing._id, args)
    return null
  },
})

export async function insertToolEvidence(
  ctx: MutationCtx,
  row: DataModel['marketEvidenceFacts']['document'],
): Promise<void> {
  await toolEvidenceAggregate.insert(ctx, row)
}

async function readToolEvidence(
  ctx: QueryCtx,
  toolRef: string,
  since: number,
) {
  const [category, ratingCount, ratingSum, completedCalls, qualifiedUses, latencyRows] = await Promise.all([
    ctx.db.query('marketToolCategories')
      .withIndex('by_toolRef', (index) => index.eq('toolRef', toolRef))
      .unique(),
    ratingAggregate.count(ctx, { namespace: toolRef }),
    ratingAggregate.sum(ctx, { namespace: toolRef }),
    toolEvidenceAggregate.count(ctx, {
      namespace: evidenceNamespace('ae_invocation_completed', toolRef),
      bounds: { lower: { key: since, inclusive: true } },
    }),
    toolEvidenceAggregate.count(ctx, {
      namespace: evidenceNamespace('ae_qualified_use', toolRef),
      bounds: { lower: { key: since, inclusive: true } },
    }),
    ctx.db.query('marketEvidenceFacts')
      .withIndex('by_kind_and_toolRef_and_occurredAt', (index) => (
        index.eq('kind', 'ae_invocation_completed')
          .eq('toolRef', toolRef)
          .gte('occurredAt', since)
      ))
      .order('desc')
      .take(MAX_LATENCY_SAMPLES),
  ])
  return {
    toolRef,
    ...(category === null ? {} : { categoryId: category.categoryId }),
    ratingCount,
    ratingSum,
    completedCalls,
    qualifiedUses,
    latencySamplesMs: latencyRows.flatMap((row) => (
      row.durationMs === undefined ? [] : [row.durationMs]
    )),
  }
}

function evidenceNamespace(kind: string, toolRef: string | undefined): string {
  return `${kind}:${toolRef ?? 'unscoped'}`
}

function uniqueToolRefs(toolRefs: readonly string[]): string[] {
  const values = [...new Set(toolRefs.map((value) => value.trim()).filter(Boolean))]
  if (values.some((value) => value.length > 256 || !isPublicToolRef(value))) {
    throw new Error('market_listing_evidence_tool_ref_invalid')
  }
  return values
}
