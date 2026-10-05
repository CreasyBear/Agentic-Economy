import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { callValue, validUsagePeriod } from './contracts'
import { beginCallExportArgs, callExportAuditId, callExportScope } from './exportAudit'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { callExportSourceDigest } from './exportSnapshot'
import { readProjectedSupport } from '../serviceUsage/projectedSupport'

export const callExportPageArgs = {
  ...beginCallExportArgs,
  snapshotAt: v.number(),
  paginationOpts: paginationOptsValidator,
}
export const callExportPageResult = v.object({
  ...paginationResultValidator(callValue).fields,
  scannedCount: v.number(),
  accountRef: v.string(),
})

/** Page an owner-derived Account range. Exclude later insertions and fail closed
 * on updates after capture began, rather than return a mixed financial snapshot.
 * The server exporter starts at null and publishes only after every page succeeds. */
export async function callExportPageHandler(ctx: QueryCtx, args: ObjectType<typeof callExportPageArgs>) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
  if (!validUsagePeriod(args.periodStartAt, args.periodEndAt)
    || !Number.isSafeInteger(args.snapshotAt) || args.snapshotAt < 0) {
    throw new Error('usage_period_invalid')
  }
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) throw new Error('call_history_page_size_invalid')
  if (args.principalRef !== undefined && (args.principalRef.length === 0 || args.principalRef.length > 500)) {
    throw new Error('usage_dimension_invalid')
  }
  const eventId = callExportAuditId(actor.canonicalAccountRef, args.exportRef)
  const admission = await ctx.db.query('auditEvents').withIndex('by_eventId', (index) => index.eq('eventId', eventId)).unique()
  if (admission === null || admission.eventType !== 'billing.call_usage_export_requested'
    || admission.payloadHash !== canonicalDigest(callExportScope(actor.canonicalAccountRef, actor.canonicalPrincipalRef, args))
    || args.snapshotAt !== Math.max(0, admission.createdAt - 1)) throw new Error('call_export_admission_invalid')
  const principalRef = args.principalRef
  const rows = principalRef === undefined
    ? ctx.db.query('capabilityCallProjections').withIndex('by_accountRef_and_createdAt', (index) => index
        .eq('accountRef', actor.canonicalAccountRef).gte('createdAt', args.periodStartAt).lt('createdAt', args.periodEndAt))
    : ctx.db.query('capabilityCallProjections').withIndex('by_accountRef_and_principalRef_and_createdAt', (index) => index
        .eq('accountRef', actor.canonicalAccountRef).eq('principalRef', principalRef)
        .gte('createdAt', args.periodStartAt).lt('createdAt', args.periodEndAt))
  const page = await rows.order('desc').paginate(args.paginationOpts)
  const captured = []
  for (const { _id, _creationTime, ...row } of page.page) {
    if (_creationTime > args.snapshotAt) continue
    if ((row.observedAt ?? row.updatedAt) > args.snapshotAt) throw new Error('call_export_source_changed')
    if (args.status === 'all' || row.state === args.status) {
      const { receiptRef, ...safeRow } = row
      const support = await readProjectedSupport(ctx, row)
      captured.push({ ...safeRow, currentDeliveredRequestUnits: support.quantityUnits, currentSupportVerified: support.verified,
        providerUnitSupportVerified: support.providerUnitObservation !== null,
        ...(receiptRef !== undefined && /^receipt:sha256:[a-f0-9]{64}$/u.test(receiptRef) ? { receiptRef } : {}) })
    }
  }
  if (page.isDone) {
    const evidence: unknown = JSON.parse(admission.redactedPayloadJson)
    const sourceDigest = typeof evidence === 'object' && evidence !== null && 'sourceDigest' in evidence ? evidence.sourceDigest : undefined
    if (typeof sourceDigest !== 'string' || sourceDigest !== await callExportSourceDigest(ctx, {
      ...args, accountRef: actor.canonicalAccountRef,
    })) throw new Error('call_export_source_changed')
  }
  return { ...page, page: captured, scannedCount: page.page.length, accountRef: actor.canonicalAccountRef }
}
