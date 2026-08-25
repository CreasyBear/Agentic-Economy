import { TableAggregate } from '@convex-dev/aggregate'
import { v } from 'convex/values'

import { isMarketCategoryId } from '../src/modules/market/listing-evidence'
import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'

const MAX_OPERATION_REFS = 20
const MAX_LATENCY_SAMPLES = 48

const ratingAggregate = new TableAggregate<{
  Namespace: string
  Key: number
  DataModel: DataModel
  TableName: 'marketOperationRatings'
}>(components.marketOperationRatings, {
  namespace: (doc) => doc.operationRef,
  sortKey: (doc) => doc.createdAt,
  sumValue: (doc) => doc.score,
})

const operationEvidenceAggregate = new TableAggregate<{
  Namespace: string
  Key: number
  DataModel: DataModel
  TableName: 'marketEvidenceFacts'
}>(components.marketOperationEvidence, {
  namespace: (doc) => evidenceNamespace(doc.kind, doc.operationRef),
  sortKey: (doc) => doc.occurredAt,
})

const listingEvidenceValue = v.object({
  operationRef: v.string(),
  categoryId: v.optional(v.string()),
  ratingCount: v.number(),
  ratingSum: v.number(),
  completedInvocations: v.number(),
  latencySamplesMs: v.array(v.number()),
})

export const read = query({
  args: {
    operationRefs: v.array(v.string()),
    since: v.number(),
  },
  returns: v.array(listingEvidenceValue),
  handler: async (ctx, args) => {
    const operationRefs = uniqueOperationRefs(args.operationRefs)
    if (operationRefs.length > MAX_OPERATION_REFS) {
      throw new Error('market_listing_evidence_operation_limit_exceeded')
    }
    return await Promise.all(
      operationRefs.map((operationRef) => readOperationEvidence(ctx, operationRef, args.since)),
    )
  },
})

export const rate = mutation({
  args: {
    operationRef: v.string(),
    score: v.number(),
    review: v.optional(v.string()),
  },
  returns: v.object({ kind: v.literal('recorded'), operationRef: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null || identity.tokenIdentifier.trim().length === 0) {
      throw new Error('market_rating_authentication_required')
    }
    if (!Number.isInteger(args.score) || args.score < 1 || args.score > 5) {
      throw new Error('market_rating_score_invalid')
    }
    if (!isOperationRef(args.operationRef)) {
      throw new Error('market_rating_operation_ref_invalid')
    }
    const review = args.review?.trim()
    if (review !== undefined && (review.length === 0 || review.length > 2_000)) {
      throw new Error('market_rating_review_invalid')
    }
    const now = Date.now()
    const existing = await ctx.db.query('marketOperationRatings')
      .withIndex('by_operationRef_and_reviewerRef', (index) => (
        index.eq('operationRef', args.operationRef).eq('reviewerRef', identity.tokenIdentifier)
      ))
      .unique()
    if (existing === null) {
      const id = await ctx.db.insert('marketOperationRatings', {
        operationRef: args.operationRef,
        reviewerRef: identity.tokenIdentifier,
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
    return { kind: 'recorded' as const, operationRef: args.operationRef }
  },
})

export const assignCategory = internalMutation({
  args: {
    operationRef: v.string(),
    categoryId: v.string(),
    assignedBy: v.string(),
    assignedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isOperationRef(args.operationRef) || !isMarketCategoryId(args.categoryId)) {
      throw new Error('market_category_assignment_invalid')
    }
    const existing = await ctx.db.query('marketOperationCategories')
      .withIndex('by_operationRef', (index) => index.eq('operationRef', args.operationRef))
      .unique()
    if (existing === null) await ctx.db.insert('marketOperationCategories', args)
    else await ctx.db.replace(existing._id, args)
    return null
  },
})

export async function insertOperationEvidence(
  ctx: MutationCtx,
  row: DataModel['marketEvidenceFacts']['document'],
): Promise<void> {
  await operationEvidenceAggregate.insert(ctx, row)
}

async function readOperationEvidence(
  ctx: QueryCtx,
  operationRef: string,
  since: number,
) {
  const [category, ratingCount, ratingSum, completedInvocations, latencyRows] = await Promise.all([
    ctx.db.query('marketOperationCategories')
      .withIndex('by_operationRef', (index) => index.eq('operationRef', operationRef))
      .unique(),
    ratingAggregate.count(ctx, { namespace: operationRef }),
    ratingAggregate.sum(ctx, { namespace: operationRef }),
    operationEvidenceAggregate.count(ctx, {
      namespace: evidenceNamespace('ae_invocation_completed', operationRef),
      bounds: { lower: { key: since, inclusive: true } },
    }),
    ctx.db.query('marketEvidenceFacts')
      .withIndex('by_kind_and_operationRef_and_occurredAt', (index) => (
        index.eq('kind', 'ae_invocation_completed')
          .eq('operationRef', operationRef)
          .gte('occurredAt', since)
      ))
      .order('desc')
      .take(MAX_LATENCY_SAMPLES),
  ])
  return {
    operationRef,
    ...(category === null ? {} : { categoryId: category.categoryId }),
    ratingCount,
    ratingSum,
    completedInvocations,
    latencySamplesMs: latencyRows.flatMap((row) => (
      row.durationMs === undefined ? [] : [row.durationMs]
    )),
  }
}

function evidenceNamespace(kind: string, operationRef: string | undefined): string {
  return `${kind}:${operationRef ?? 'unscoped'}`
}

function uniqueOperationRefs(operationRefs: readonly string[]): string[] {
  const values = [...new Set(operationRefs.map((value) => value.trim()).filter(Boolean))]
  if (values.some((value) => value.length > 256)) {
    throw new Error('market_listing_evidence_operation_ref_invalid')
  }
  return values
}

function isOperationRef(value: string): boolean {
  return /^operation:v1:[0-9a-f]{64}$/.test(value)
}
