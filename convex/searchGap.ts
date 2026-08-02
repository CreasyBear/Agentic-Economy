import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { literalUnion } from '@/modules/common/convex-literals'
import {
  addFactObservations,
  mergeFactCounts,
  rankFactCounts,
  SearchGapFactValues,
  SearchGapSurfaceValues,
} from '@/modules/demand/public'
import type {
  SearchGapFact,
  SearchGapFactCount,
} from '@/modules/demand/public'
import { readActiveAdminMembership, resolveBusinessActor } from './authz'
import { requireAdminAuthority } from '@/modules/security/public'

const factValidator = literalUnion(SearchGapFactValues)
const surfaceValidator = literalUnion(SearchGapSurfaceValues)
const factCountValidator = v.object({ fact: factValidator, searches: v.number() })

/** One row per (surface, query, day) and per (slug, day). */
const dayBucketRetentionDays = 90
const searchRowsPerDayCeiling = 2_000
const outreachScanLimit = 500
const ownerScanLimit = 100


const utcDayBucket = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(0, 10)

const orderedFactUnion = (
  ...groups: readonly (readonly SearchGapFact[])[]
): SearchGapFact[] => {
  const included = new Set(groups.flat())
  return SearchGapFactValues.filter((fact) => included.has(fact))
}

/**
 * Rows written before per-fact counting existed carry only `missingFacts` and a
 * shared `occurrences`. Attributing the whole occurrence count to each fact it
 * recorded is the most faithful reconstruction available — those rows genuinely
 * observed every listed fact on every one of their occurrences.
 */
const legacySafeFactCounts = (row: Readonly<{
  factCounts?: readonly SearchGapFactCount[]
  missingFacts?: readonly SearchGapFact[]
  occurrences: number
}>): SearchGapFactCount[] => {
  if (row.factCounts !== undefined) return [...row.factCounts]
  return orderedFactUnion(row.missingFacts ?? []).map((fact) => ({ fact, searches: row.occurrences }))
}

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
  handler: async (ctx, args) => {
    const trimmedQuery = args.queryText.trim()
    if (trimmedQuery.length === 0) {
      return { kind: 'refused' as const, code: 'empty_query' as const }
    }
    if (trimmedQuery.length > 120) {
      return { kind: 'refused' as const, code: 'query_too_long' as const }
    }
    if (!Number.isInteger(args.candidateCount) || args.candidateCount < 0) {
      return { kind: 'refused' as const, code: 'invalid_candidate_count' as const }
    }

    const normalizedQuery = trimmedQuery.toLowerCase().replace(/\s+/g, ' ')
    const now = Date.now()
    const dayBucket = utcDayBucket(now)
    const fingerprint = `${args.surface}|${normalizedQuery}|${dayBucket}`
    const existingSearch = await ctx.db
      .query('searchGapRecords')
      .withIndex('by_fingerprint', (q) => q.eq('fingerprint', fingerprint))
      .unique()

    if (existingSearch === null) {
      const dayRows = await ctx.db
        .query('searchGapRecords')
        .withIndex('by_dayBucket', (q) => q.eq('dayBucket', dayBucket))
        .take(searchRowsPerDayCeiling)
      if (dayRows.length >= searchRowsPerDayCeiling) {
        return { kind: 'refused' as const, code: 'daily_ceiling_reached' as const }
      }

      await ctx.db.insert('searchGapRecords', {
        fingerprint,
        queryText: trimmedQuery,
        surface: args.surface,
        requiredFacts: orderedFactUnion(args.requiredFacts),
        candidateCount: args.candidateCount,
        occurrences: 1,
        unanswered: args.candidateCount === 0,
        dayBucket,
        firstSeenAt: now,
        lastSeenAt: now,
      })
    } else {
      await ctx.db.patch(existingSearch._id, {
        occurrences: existingSearch.occurrences + 1,
        lastSeenAt: now,
        candidateCount: args.candidateCount,
        unanswered: args.candidateCount === 0,
        requiredFacts: orderedFactUnion(existingSearch.requiredFacts, args.requiredFacts),
      })
    }

    const gapsBySlug = new Map<string, SearchGapFact[]>()
    for (const gap of args.gaps.slice(0, 5)) {
      const slug = gap.slug.trim().slice(0, 120)
      if (slug.length === 0) continue
      gapsBySlug.set(slug, orderedFactUnion(gapsBySlug.get(slug) ?? [], gap.missingFacts))
    }

    for (const [slug, missingFacts] of gapsBySlug) {
      const businessFingerprint = `${slug}|${dayBucket}`
      const existingBusiness = await ctx.db
        .query('searchGapBusinessRecords')
        .withIndex('by_fingerprint', (q) => q.eq('fingerprint', businessFingerprint))
        .unique()

      if (existingBusiness === null) {
        await ctx.db.insert('searchGapBusinessRecords', {
          fingerprint: businessFingerprint,
          slug,
          factCounts: addFactObservations([], missingFacts),
          occurrences: 1,
          dayBucket,
          lastQueryText: trimmedQuery,
          firstSeenAt: now,
          lastSeenAt: now,
        })
      } else {
        await ctx.db.patch(existingBusiness._id, {
          factCounts: addFactObservations(legacySafeFactCounts(existingBusiness), missingFacts),
          occurrences: existingBusiness.occurrences + 1,
          lastQueryText: trimmedQuery,
          lastSeenAt: now,
        })
      }
    }

    return { kind: 'ok' as const, recorded: gapsBySlug.size }
  },
})

/**
 * Identity-bound. The caller never names the business: a slug argument would
 * make every owner's demand signal readable by anyone who can read the public
 * catalog.
 */
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
  handler: async (ctx, args) => {
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

    const rows = await ctx.db
      .query('searchGapBusinessRecords')
      .withIndex('by_slug_and_dayBucket', (q) => q.eq('slug', slug))
      .order('desc')
      .take(ownerScanLimit)
    const windowed = rows.filter((row) => row.dayBucket >= args.sinceDayBucket)
    const byFact = rankFactCounts(mergeFactCounts(...windowed.map(legacySafeFactCounts)))

    return {
      kind: 'available' as const,
      slug,
      totalSearches: windowed.reduce((total, row) => total + row.occurrences, 0),
      byFact,
      truncated: rows.length === ownerScanLimit && windowed.length === rows.length,
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
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const membership = identity === null
      ? undefined
      : await readActiveAdminMembership(ctx.db, identity)
    if (requireAdminAuthority(membership, 'read_admin_readbacks').kind === 'denied') {
      return { kind: 'denied' as const }
    }

    const rows = await ctx.db
      .query('searchGapBusinessRecords')
      .withIndex('by_dayBucket', (q) => q.gte('dayBucket', args.sinceDayBucket))
      .order('desc')
      .take(outreachScanLimit)
    const grouped = new Map<string, {
      searches: number
      days: Set<string>
      factCounts: SearchGapFactCount[]
      lastQueryText: string
      lastSeenAt: number
    }>()

    for (const row of rows) {
      const current = grouped.get(row.slug)
      if (current === undefined) {
        grouped.set(row.slug, {
          searches: row.occurrences,
          days: new Set([row.dayBucket]),
          factCounts: legacySafeFactCounts(row),
          lastQueryText: row.lastQueryText,
          lastSeenAt: row.lastSeenAt,
        })
        continue
      }
      current.searches += row.occurrences
      current.days.add(row.dayBucket)
      current.factCounts = mergeFactCounts(current.factCounts, legacySafeFactCounts(row))
      if (row.lastSeenAt > current.lastSeenAt) {
        current.lastSeenAt = row.lastSeenAt
        current.lastQueryText = row.lastQueryText
      }
    }

    const unansweredScan = await ctx.db
      .query('searchGapRecords')
      .withIndex('by_unanswered_and_dayBucket', (q) => q.eq('unanswered', true))
      .order('desc')
      .take(outreachScanLimit)
    const unansweredRows = unansweredScan.filter(
      (row) => row.dayBucket >= args.sinceDayBucket,
    )

    return {
      kind: 'available' as const,
      businesses: [...grouped.entries()]
        .map(([slug, value]) => ({
          slug,
          searches: value.searches,
          distinctDays: value.days.size,
          factCounts: value.factCounts,
          lastQueryText: value.lastQueryText,
        }))
        .sort((left, right) =>
          right.distinctDays - left.distinctDays
          || right.searches - left.searches
          || left.slug.localeCompare(right.slug)),
      unanswered: unansweredRows
        .map((row) => ({
          queryText: row.queryText,
          surface: row.surface,
          searches: row.occurrences,
          lastSeenAt: row.lastSeenAt,
        }))
        .sort((left, right) =>
          right.searches - left.searches || right.lastSeenAt - left.lastSeenAt),
      truncated: rows.length === outreachScanLimit
        || unansweredScan.length === outreachScanLimit,
    }
  },
})

/**
 * Bounded retention. Search text is user-typed and has no value once the
 * operator window has passed.
 */
export const pruneSearchGapRecords = mutationGeneric({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 200, 1), 500)
    const cutoff = utcDayBucket(Date.now() - dayBucketRetentionDays * 24 * 60 * 60 * 1_000)
    const expiredSearches = await ctx.db
      .query('searchGapRecords')
      .withIndex('by_dayBucket', (q) => q.lt('dayBucket', cutoff))
      .take(batchSize)
    const expiredBusinesses = await ctx.db
      .query('searchGapBusinessRecords')
      .withIndex('by_dayBucket', (q) => q.lt('dayBucket', cutoff))
      .take(batchSize)

    for (const row of [...expiredSearches, ...expiredBusinesses]) {
      await ctx.db.delete(row._id)
    }

    const deleted = expiredSearches.length + expiredBusinesses.length
    return {
      deleted,
      done: expiredSearches.length < batchSize && expiredBusinesses.length < batchSize,
    }
  },
})

