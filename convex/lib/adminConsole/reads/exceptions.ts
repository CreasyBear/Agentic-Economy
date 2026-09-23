import { v } from 'convex/values'

import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { parseBusinessSlug } from '@/modules/business/public'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import type {
  AdminException,
  AdminExceptionFeed,
  AdminExceptionKind,
  AdminResolutionRow,
} from '@/lib/operator/admin-console/contracts'
import { exceptionRef } from '@/lib/operator/admin-console/exception-projection'
import type { QueryCtx } from '../../../_generated/server'

const UNCERTAIN_AGE_MS = 15 * 60 * 1_000
// Per-source read ceiling. The feed exposes the oldest 100 within these bounded reads.
const SOURCE_READ_LIMIT = 500
const FEED_LIMIT = 100
const OPEN_DISPUTE_STATUSES: readonly ('opened' | 'updated' | 'contested')[] = [
  'opened',
  'updated',
  'contested',
]
const REVIEWABLE_SOURCE_AUTHORITY_STATES: readonly ('review_required' | undefined)[] = [
  'review_required',
  undefined,
]
const ADMISSION_CASE_STATES: readonly ('submitted' | 'under_review')[] = [
  'submitted',
  'under_review',
]

export const adminExceptionKindValue = v.union(
  v.literal('uncertain_call'),
  v.literal('removal_dispute'),
  v.literal('source_authority_review'),
  v.literal('admission_case'),
)

export const adminExceptionValue = v.union(
  v.object({ kind: v.literal('uncertain_call'), callRef: v.string(), since: v.number() }),
  v.object({
    kind: v.literal('removal_dispute'),
    disputeRef: v.string(),
    businessSlug: v.string(),
    since: v.number(),
  }),
  v.object({
    kind: v.literal('source_authority_review'),
    publicationRef: v.string(),
    businessSlug: v.string(),
    since: v.number(),
  }),
  v.object({
    kind: v.literal('admission_case'),
    caseRef: v.string(),
    businessSlug: v.string(),
    since: v.number(),
  }),
)

export const adminExceptionFeedValue = v.object({
  items: v.array(adminExceptionValue),
  total: v.number(),
  truncated: v.boolean(),
  counts: v.object({
    uncertain_call: v.number(),
    removal_dispute: v.number(),
    source_authority_review: v.number(),
    admission_case: v.number(),
  }),
  unavailable: v.array(adminExceptionKindValue),
})

const purchaseTerminalStateValue = v.union(
  v.literal('completed'),
  v.literal('refunded'),
  v.literal('released'),
  v.literal('disputed'),
)

export const adminResolutionRowValue = v.object({
  callRef: v.string(),
  terminalState: purchaseTerminalStateValue,
  resolvedAt: v.number(),
})


type GuardedAdminExceptionSource =
  | Readonly<{ items: readonly AdminException[] }>
  | Readonly<{ unavailable: AdminExceptionKind }>

export async function guardedAdminExceptionSource(
  kind: AdminExceptionKind,
  read: () => Promise<readonly AdminException[]>,
): Promise<GuardedAdminExceptionSource> {
  try {
    return { items: await read() }
  } catch (error) {
    void error
    console.warn('admin_exception_source_unavailable', kind)
    return { unavailable: kind }
  }
}

export async function listAdminExceptions(
  ctx: QueryCtx,
  kind: AdminExceptionKind | null,
): Promise<AdminExceptionFeed> {
  const kinds: readonly AdminExceptionKind[] = [
    'uncertain_call', 'removal_dispute', 'source_authority_review', 'admission_case',
  ]
  const sources = await Promise.all(kinds.map(async (sourceKind) =>
    await guardedAdminExceptionSource(sourceKind, async () => await readSource(ctx, sourceKind))))
  const all = sources.flatMap((source) => 'items' in source ? source.items : [])
  const counts: Record<AdminExceptionKind, number> = {
    uncertain_call: 0, removal_dispute: 0, source_authority_review: 0, admission_case: 0,
  }
  for (const item of all) counts[item.kind] += 1
  const items = (kind === null ? all : all.filter((item) => item.kind === kind))
    .sort((left, right) => left.since - right.since
      || left.kind.localeCompare(right.kind)
      || exceptionRef(left).localeCompare(exceptionRef(right)))
  const unavailable = sources.flatMap((source) => 'unavailable' in source ? [source.unavailable] : [])
  return { items: items.slice(0, FEED_LIMIT), total: items.length, truncated: items.length > FEED_LIMIT, counts, unavailable }
}


export async function listRecentPurchaseResolutionRows(
  ctx: QueryCtx,
): Promise<readonly AdminResolutionRow[]> {
  const rows = await ctx.db.query('purchaseResolutionRecords')
    .withIndex('by_resolvedAt')
    .order('desc')
    .take(50)
  return rows.map((row) => ({
    callRef: row.callRef,
    terminalState: row.terminalState,
    resolvedAt: row.resolvedAt,
  }))
}

async function readSource(
  ctx: QueryCtx,
  kind: AdminExceptionKind,
): Promise<readonly AdminException[]> {
  switch (kind) {
    case 'uncertain_call': return await readUncertainCalls(ctx)
    case 'removal_dispute': return await readRemovalDisputes(ctx)
    case 'source_authority_review': return await readSourceAuthorityReviews(ctx)
    case 'admission_case': return await readAdmissionCases(ctx)
  }
}

async function readUncertainCalls(ctx: QueryCtx): Promise<readonly AdminException[]> {
  const cutoff = Date.now() - UNCERTAIN_AGE_MS
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_state_and_reconciliation_nextAttemptAt', (query) =>
      query.eq('state', 'reconciliation_required'))
    .filter((query) => query.lt(query.field('createdAt'), cutoff))
    .take(SOURCE_READ_LIMIT)
  return rows.flatMap((row): AdminException[] => {
    const parsed = parseCallRef(row.callRef)
    return parsed.kind === 'valid'
      ? [{ kind: 'uncertain_call', callRef: parsed.ref, since: row.createdAt }]
      : []
  })
}

async function readRemovalDisputes(ctx: QueryCtx): Promise<readonly AdminException[]> {
  const pages = await Promise.all(OPEN_DISPUTE_STATUSES.map(async (status) =>
    await ctx.db.query('disputes')
      .withIndex('by_status_and_updatedAt', (query) => query.eq('status', status))
      .order('asc')
      .take(SOURCE_READ_LIMIT)))
  const rows = mergeOldest(pages, (row) => row.createdAt)
  const joined = await Promise.all(rows.map(async (row): Promise<AdminException | null> => {
    const business = await ctx.db.get(row.businessId)
    if (business === null) return null
    const slug = parseBusinessSlug(business.slug)
    return slug.kind === 'valid'
      ? { kind: 'removal_dispute', disputeRef: String(row._id), businessSlug: slug.slug, since: row.createdAt }
      : null
  }))
  return joined.filter((item) => item !== null)
}

async function readSourceAuthorityReviews(ctx: QueryCtx): Promise<readonly AdminException[]> {
  const pages = await Promise.all(REVIEWABLE_SOURCE_AUTHORITY_STATES.map(async (state) =>
    await ctx.db.query('capabilityPublications')
      .withIndex('by_sourceAuthorityState_and_updatedAt', (query) =>
        query.eq('sourceAuthorityState', state))
      .order('asc')
      .take(SOURCE_READ_LIMIT)))
  const rows = mergeOldest(pages, (row) => row.updatedAt)
  const joined = await Promise.all(rows.map(async (row): Promise<AdminException | null> => {
    if (!isPublicToolRef(row.toolRef)) return null
    const business = await ctx.db.get(row.businessId)
    if (business === null) return null
    const slug = parseBusinessSlug(business.slug)
    return slug.kind === 'valid'
      ? {
          kind: 'source_authority_review',
          publicationRef: row.toolRef,
          businessSlug: slug.slug,
          since: row.updatedAt,
        }
      : null
  }))
  return joined.filter((item) => item !== null)
}

async function readAdmissionCases(ctx: QueryCtx): Promise<readonly AdminException[]> {
  const pages = await Promise.all(ADMISSION_CASE_STATES.map(async (state) =>
    await ctx.db.query('capabilitySupplyAdmissionCases')
      .withIndex('by_state_and_updatedAt', (query) => query.eq('state', state))
      .order('asc')
      .take(SOURCE_READ_LIMIT)))
  const rows = mergeOldest(pages, (row) => row.updatedAt)
  const joined = await Promise.all(rows.map(async (row): Promise<AdminException | null> => {
    const business = await ctx.db.get(row.businessId)
    if (business === null) return null
    const slug = parseBusinessSlug(business.slug)
    return slug.kind === 'valid'
      ? { kind: 'admission_case', caseRef: row.caseRef, businessSlug: slug.slug, since: row.updatedAt }
      : null
  }))
  return joined.filter((item) => item !== null)
}

function mergeOldest<T>(pages: readonly (readonly T[])[], since: (row: T) => number): T[] {
  return pages.flat().sort((left, right) => since(left) - since(right)).slice(0, SOURCE_READ_LIMIT)
}
