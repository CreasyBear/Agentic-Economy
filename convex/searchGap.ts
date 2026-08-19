import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { literalUnion } from '@/modules/common/convex-literals'
import {
  SearchGapFactValues,
  SearchGapSurfaceValues,
} from '@/modules/demand/public'
import { resolveBusinessActor } from './authz'

const factValidator = literalUnion(SearchGapFactValues)
const surfaceValidator = literalUnion(SearchGapSurfaceValues)
const factCountValidator = v.object({ fact: factValidator, searches: v.number() })

export const recordSearchGaps = mutationGeneric({
  args: {
    queryText: v.string(),
    surface: surfaceValidator,
    requiredFacts: v.array(factValidator),
    candidateCount: v.number(),
    gaps: v.array(v.object({
      slug: v.string(),
      missingFacts: v.array(factValidator),
    })),
  },
  returns: v.union(
    v.object({ kind: v.literal('ok'), recorded: v.number() }),
    v.object({
      kind: v.literal('refused'),
      code: v.union(
        v.literal('empty_query'),
        v.literal('query_too_long'),
        v.literal('invalid_candidate_count'),
        v.literal('daily_ceiling_reached'),
      ),
    }),
  ),
  handler: async () => ({ kind: 'refused' as const, code: 'empty_query' as const }),
})

export const readOwnerSearchGaps = queryGeneric({
  args: { sinceDayBucket: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('denied') }),
    v.object({
      kind: v.literal('available'),
      slug: v.string(),
      totalSearches: v.number(),
      byFact: v.array(factCountValidator),
      truncated: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'denied' as const }
    }

    const owner = await ctx.db
      .query('owners')
      .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', actor.clerkUserId))
      .unique()
    if (owner === null) {
      return { kind: 'denied' as const }
    }

    const businesses = await ctx.db
      .query('businesses')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
      .order('desc')
      .take(20)
    const slug = businesses
      .map((business) => business.slug)
      .find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
    if (slug === undefined) {
      return { kind: 'denied' as const }
    }

    return {
      kind: 'available' as const,
      slug,
      totalSearches: 0,
      byFact: [],
      truncated: false,
    }
  },
})

export const readSearchGapOutreach = queryGeneric({
  args: { sinceDayBucket: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('denied') }),
    v.object({
      kind: v.literal('available'),
      businesses: v.array(v.object({
        slug: v.string(),
        searches: v.number(),
        distinctDays: v.number(),
        factCounts: v.array(factCountValidator),
        lastQueryText: v.string(),
      })),
      unanswered: v.array(v.object({
        queryText: v.string(),
        surface: surfaceValidator,
        searches: v.number(),
        lastSeenAt: v.number(),
      })),
      truncated: v.boolean(),
    }),
  ),
  handler: async () => ({ kind: 'denied' as const }),
})

export const pruneSearchGapRecords = mutationGeneric({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async () => ({ deleted: 0, done: true }),
})
