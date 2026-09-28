import { paginationOptsValidator, paginationResultValidator, type PaginationOptions, type PaginationResult } from 'convex/server'
import { v } from 'convex/values'

import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { parseBusinessSlug } from '@/modules/business/public'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import type { AdminException, AdminExceptionKind, AdminExceptionPartition, AdminResolutionRow } from '@/lib/operator/admin-console/contracts'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'

const UNCERTAIN_AGE_MS = 15 * 60 * 1_000

export const adminExceptionKindValue = v.union(
  v.literal('uncertain_call'), v.literal('removal_dispute'),
  v.literal('source_authority_review'), v.literal('admission_case'),
)
export const adminExceptionPartitionValue = v.union(
  v.literal('reconciliation_required'), v.literal('opened'), v.literal('updated'),
  v.literal('contested'), v.literal('review_required'), v.literal('unset'),
  v.literal('submitted'), v.literal('under_review'),
)
export const adminExceptionValue = v.union(
  v.object({ kind: v.literal('uncertain_call'), callRef: v.string(), since: v.number() }),
  v.object({ kind: v.literal('removal_dispute'), disputeRef: v.string(), businessSlug: v.string(), since: v.number(),
    state: v.union(v.literal('opened'), v.literal('updated'), v.literal('contested'), v.literal('closed')) }),
  v.object({ kind: v.literal('source_authority_review'), publicationRef: v.string(), businessSlug: v.string(), since: v.number() }),
  v.object({ kind: v.literal('admission_case'), caseRef: v.string(), businessSlug: v.string(), since: v.number(),
    state: v.union(v.literal('submitted'), v.literal('under_review'), v.literal('completed')) }),
)
export const adminExceptionPageArgs = {
  kind: adminExceptionKindValue,
  partition: adminExceptionPartitionValue,
  paginationOpts: paginationOptsValidator,
}
export const adminExceptionPageValue = paginationResultValidator(adminExceptionValue)
export const adminExceptionOverviewValue = v.array(v.object({
  kind: adminExceptionKindValue,
  partition: adminExceptionPartitionValue,
  observed: v.number(),
  complete: v.boolean(),
  unavailable: v.boolean(),
}))

const purchaseTerminalStateValue = v.union(
  v.literal('completed'), v.literal('refunded'), v.literal('released'), v.literal('disputed'),
)
export const adminResolutionRowValue = v.object({
  callRef: v.string(), terminalState: purchaseTerminalStateValue, resolvedAt: v.number(),
})

export const EXCEPTION_PARTITIONS = {
  uncertain_call: ['reconciliation_required'],
  removal_dispute: ['opened', 'updated', 'contested'],
  source_authority_review: ['review_required', 'unset'],
  admission_case: ['submitted', 'under_review'],
} as const satisfies Record<AdminExceptionKind, readonly AdminExceptionPartition[]>

function isPartition(kind: AdminExceptionKind, partition: AdminExceptionPartition): boolean {
  return (EXCEPTION_PARTITIONS[kind] as readonly AdminExceptionPartition[]).includes(partition)
}


// Every cursor belongs to one indexed kind/state partition. No count implies other partitions were read.
export async function listAdminExceptionsPage(
  ctx: QueryCtx, kind: AdminExceptionKind, partition: AdminExceptionPartition, paginationOpts: PaginationOptions,
): Promise<PaginationResult<AdminException>> {
  if (!isPartition(kind, partition)) throw new Error('invalid_exception_partition')
  switch (kind) {
    case 'uncertain_call': {
      const result = await ctx.db.query('capabilityCalls')
        .withIndex('by_state_and_reconciliation_nextAttemptAt', (q) => q.eq('state', 'reconciliation_required'))
        .order('asc').paginate(paginationOpts)
      const cutoff = Date.now() - UNCERTAIN_AGE_MS
      return { ...result, page: result.page.flatMap((row): AdminException[] => {
        const parsed = parseCallRef(row.callRef)
        return row.createdAt < cutoff && parsed.kind === 'valid'
          ? [{ kind: 'uncertain_call', callRef: parsed.ref, since: row.createdAt }] : []
      }) }
    }
    case 'removal_dispute': {
      const result = await ctx.db.query('disputes')
        .withIndex('by_status_and_updatedAt', (q) => q.eq('status', partition as 'opened' | 'updated' | 'contested'))
        .order('asc').paginate(paginationOpts)
      return { ...result, page: await projectBusinessRows(ctx, result.page, 'removal_dispute') }
    }
    case 'source_authority_review': {
      const result = await ctx.db.query('capabilityPublications')
        .withIndex('by_sourceAuthorityState_and_updatedAt', (q) => q.eq('sourceAuthorityState', partition === 'unset' ? undefined : 'review_required'))
        .order('asc').paginate(paginationOpts)
      return { ...result, page: await projectBusinessRows(ctx, result.page, 'source_authority_review') }
    }
    case 'admission_case': {
      const result = await ctx.db.query('capabilitySupplyAdmissionCases')
        .withIndex('by_state_and_updatedAt', (q) => q.eq('state', partition as 'submitted' | 'under_review'))
        .order('asc').paginate(paginationOpts)
      return { ...result, page: await projectBusinessRows(ctx, result.page, 'admission_case') }
    }
  }
}

async function projectBusinessRows(
  ctx: QueryCtx,
  rows: readonly (Doc<'disputes'> | Doc<'capabilityPublications'> | Doc<'capabilitySupplyAdmissionCases'>)[],
  kind: 'removal_dispute' | 'source_authority_review' | 'admission_case',
): Promise<AdminException[]> {
  const projected = await Promise.all(rows.map(async (row): Promise<AdminException | null> => {
    const business = await ctx.db.get(row.businessId)
    if (business === null) return null
    const slug = parseBusinessSlug(business.slug)
    if (slug.kind !== 'valid') return null
    switch (kind) {
      case 'removal_dispute': return 'status' in row
        ? { kind, disputeRef: String(row._id), businessSlug: slug.slug, since: row.createdAt, state: row.status } : null
      case 'source_authority_review': return 'sourceAuthorityState' in row && isPublicToolRef(row.toolRef)
        ? { kind, publicationRef: row.toolRef, businessSlug: slug.slug, since: row.updatedAt } : null
      case 'admission_case': return 'caseRef' in row
        ? { kind, caseRef: row.caseRef, businessSlug: slug.slug, since: row.updatedAt, state: row.state } : null
    }
  }))
  return projected.filter((item) => item !== null)
}

export async function readAdminException(
  ctx: QueryCtx, kind: 'removal_dispute' | 'admission_case', ref: string,
): Promise<AdminException | null> {
  if (kind === 'removal_dispute') {
    const id = ctx.db.normalizeId('disputes', ref)
    if (id === null) return null
    const row = await ctx.db.get(id)
    return row === null ? null : (await projectBusinessRows(ctx, [row], kind))[0] ?? null
  }
  const row = await ctx.db.query('capabilitySupplyAdmissionCases')
    .withIndex('by_caseRef', (q) => q.eq('caseRef', ref)).unique()
  return row === null ? null : (await projectBusinessRows(ctx, [row], kind))[0] ?? null
}

// Overview samples source-index order. A partial sample never supplies an exact backlog count.
async function readBoundedOverviewPartition(ctx: QueryCtx, kind: AdminExceptionKind, partition: AdminExceptionPartition) {
  const completeAndCount = (rows: readonly unknown[], observed: number) => ({
    observed, complete: rows.length <= 20,
  })
  switch (kind) {
    case 'uncertain_call': {
      const rows = await ctx.db.query('capabilityCalls')
        .withIndex('by_state_and_reconciliation_nextAttemptAt', (q) => q.eq('state', 'reconciliation_required'))
        .order('asc').take(21)
      const cutoff = Date.now() - UNCERTAIN_AGE_MS
      return completeAndCount(rows, rows.slice(0, 20)
        .filter((row) => row.createdAt < cutoff && parseCallRef(row.callRef).kind === 'valid').length)
    }
    case 'removal_dispute': {
      const rows = await ctx.db.query('disputes')
        .withIndex('by_status_and_updatedAt', (q) => q.eq('status', partition as 'opened' | 'updated' | 'contested'))
        .order('asc').take(21)
      return completeAndCount(rows, (await projectBusinessRows(ctx, rows.slice(0, 20), kind)).length)
    }
    case 'source_authority_review': {
      const rows = await ctx.db.query('capabilityPublications')
        .withIndex('by_sourceAuthorityState_and_updatedAt', (q) => q.eq('sourceAuthorityState', partition === 'unset' ? undefined : 'review_required'))
        .order('asc').take(21)
      return completeAndCount(rows, (await projectBusinessRows(ctx, rows.slice(0, 20), kind)).length)
    }
    case 'admission_case': {
      const rows = await ctx.db.query('capabilitySupplyAdmissionCases')
        .withIndex('by_state_and_updatedAt', (q) => q.eq('state', partition as 'submitted' | 'under_review'))
        .order('asc').take(21)
      return completeAndCount(rows, (await projectBusinessRows(ctx, rows.slice(0, 20), kind)).length)
    }
  }
}

export async function readAdminExceptionOverview(ctx: QueryCtx) {
  const partitions = Object.entries(EXCEPTION_PARTITIONS) as [AdminExceptionKind, readonly AdminExceptionPartition[]][]
  return await Promise.all(partitions.flatMap(([kind, states]) => states.map(async (partition) => {
    try {
      const sample = await readBoundedOverviewPartition(ctx, kind, partition)
      return { kind, partition, ...sample, unavailable: false }
    } catch (error) {
      console.warn('admin_exception_source_unavailable', kind, error)
      return { kind, partition, observed: 0, complete: false, unavailable: true }
    }
  })))
}

export async function listRecentPurchaseResolutionRows(ctx: QueryCtx): Promise<readonly AdminResolutionRow[]> {
  const rows = await ctx.db.query('purchaseResolutionRecords')
    .withIndex('by_resolvedAt').order('desc').take(50)
  return rows.map((row) => ({ callRef: row.callRef, terminalState: row.terminalState, resolvedAt: row.resolvedAt }))
}
