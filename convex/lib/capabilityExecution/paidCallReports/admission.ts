import { v } from 'convex/values'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { resolveBusinessActor } from '../../../authz'
import { recordMarketEvidenceFact } from '../../../marketEvidence'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentUtcDayBounds } from '@/modules/common/freshness'
import { paidCallReportReason, paidCallReportViewValue, type PaidCallReportView } from '@/modules/capability-execution/paid-call-report'
import { bookingFromRows } from '../../money/managedCall/booking'
import { readPurchaseResolutionByCallRef } from '../callLifecycle/purchaseResolutionMaterialize'
import { assertAdmission } from '../../platform/rateLimit'

export const callArgs = v.object({ callRef: v.string() })
export const viewValue = paidCallReportViewValue
export const refused = (callRef: string, code: Extract<PaidCallReportView, { kind: 'refused' }>['code'], retryable = false): PaidCallReportView => ({ kind: 'refused', callRef, code, retryable })

export function reportView(row: Doc<'paidCallReports'>, now: number): PaidCallReportView {
  return { kind: row.state, callRef: row.callRef, reportRef: row.reportRef,
    amountUnits: row.booking.buyerAmountUnits,
    expiredPromotionalUnits: expiredPromotionalUnits(row.booking.promotionalCreditAllocation, now) }
}

function expiredPromotionalUnits(allocation: Doc<'capabilityCalls'>['promotionalCreditAllocation'], now: number): string {
  return (allocation?.grants ?? []).reduce((sum, grant) => sum + (grant.expiresAt <= now ? BigInt(grant.amountUnits) : 0n), 0n).toString()
}

async function loadOwner(ctx: QueryCtx | MutationCtx, callRef: string) {
  if (callRef.length === 0 || callRef.length > 256) return null
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
  if (call === null || call.ownerId !== actor.canonicalAccountRef
    || call.environment !== deploymentPaymentEnvironment(env)) return null
  return { actor, call }
}

async function eligibleBooking(ctx: QueryCtx | MutationCtx, call: Doc<'capabilityCalls'>) {
  if (call.state !== 'completed' || call.result?.kind !== 'completed'
    || call.formanceFinancialState !== 'settled' || call.quoteRef === undefined
    || call.result.receipt?.commercialModel !== 'account_aud'
    || call.result.receipt.state !== 'settled' || call.result.receipt.refundState !== 'not_applicable'
    || call.formanceSettlementRefs?.length !== 2 + (call.promotionalCreditAllocation?.grants.length ?? 0)) return null
  const quoteRef = call.quoteRef
  const quote = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  const booking = quote === null ? null : bookingFromRows(call, quote)
  const resolution = await readPurchaseResolutionByCallRef(ctx, call.callRef)
  if (booking === null || BigInt(booking.buyerAmountUnits) <= 0n || resolution?.terminalState !== 'completed'
    || call.result.receipt.totalBuyerCharge.units !== booking.buyerAmountUnits) return null
  return { booking, resolution, originalSettlementRefs: call.formanceSettlementRefs }
}

async function remainingQuota(ctx: QueryCtx | MutationCtx, reporterRef: string, environment: 'sandbox' | 'production', now: number) {
  const policies = await ctx.db.query('moneyCommercialPolicies')
    .withIndex('by_environment_and_family_and_lifecycle', q => q.eq('environment', environment).eq('family', 'operations').eq('lifecycle', 'active')).take(2)
  const policy = policies[0]
  if (policies.length > 1 || (policy !== undefined && (policy.effectiveAt > now || policy.expiresAt <= now || policy.control.family !== 'operations'))) return null
  const limit = policy?.control.family === 'operations' ? policy.control.paidCallReportsPerDay ?? 3 : 3
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 20) return null
  const day = currentUtcDayBounds(now)
  const reports = await ctx.db.query('paidCallReports')
    .withIndex('by_reporterRef_and_createdAt', q => q.eq('reporterRef', reporterRef).gte('createdAt', day.periodStartAt).lt('createdAt', day.periodEndAt)).take(21)
  return { remaining: Math.max(0, limit - reports.length), resetAt: day.periodEndAt }
}

export async function readOwnerHandler(ctx: QueryCtx, args: { callRef: string }): Promise<PaidCallReportView> {
  const owned = await loadOwner(ctx, args.callRef)
  if (owned === null) return refused(args.callRef, 'owner_required')
  const existing = await ctx.db.query('paidCallReports').withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  if (existing !== null) return reportView(existing, Date.now())
  const eligible = await eligibleBooking(ctx, owned.call)
  if (eligible === null) return refused(args.callRef, 'call_not_eligible')
  const quota = await remainingQuota(ctx, owned.actor.canonicalPrincipalRef, owned.call.environment, Date.now())
  if (quota === null) return refused(args.callRef, 'source_unavailable', true)
  if (quota.remaining === 0) return { kind: 'refused', callRef: args.callRef, code: 'report_limit_reached', retryable: false, resetAt: quota.resetAt }
  return { kind: 'eligible', callRef: args.callRef, amountUnits: eligible.booking.buyerAmountUnits,
    expiredPromotionalUnits: expiredPromotionalUnits(eligible.booking.promotionalCreditAllocation, Date.now()), remainingToday: quota.remaining }
}

/** Requires an owned settled sale. Ensures one immutable report and one quota
 * slot in this transaction. Concurrent attempts cannot exceed the daily limit.
 * Existing reports replay before quota/rate admission; no ledger work here. */
export async function admitHandler(ctx: MutationCtx, args: { callRef: string }): Promise<PaidCallReportView> {
  const owned = await loadOwner(ctx, args.callRef)
  if (owned === null) return refused(args.callRef, 'owner_required')
  const existing = await ctx.db.query('paidCallReports').withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  if (existing !== null) return reportView(existing, Date.now())
  const eligible = await eligibleBooking(ctx, owned.call)
  if (eligible === null) return refused(args.callRef, 'call_not_eligible')
  const now = Date.now()
  const quota = await remainingQuota(ctx, owned.actor.canonicalPrincipalRef, owned.call.environment, now)
  if (quota === null) return refused(args.callRef, 'source_unavailable', true)
  if (quota.remaining === 0) return { kind: 'refused', callRef: args.callRef, code: 'report_limit_reached', retryable: false, resetAt: quota.resetAt }
  const rate = await assertAdmission(ctx, { name: 'paid-call-report', key: owned.actor.canonicalPrincipalRef })
  if (!rate.ok) return refused(args.callRef, 'rate_limited', true)
  const reportRef = `paid-call-report:${canonicalDigest({ callRef: args.callRef }).slice(7)}`
  const material = { reportRef, callRef: args.callRef, accountRef: owned.actor.canonicalAccountRef,
    reporterRef: owned.actor.canonicalPrincipalRef, toolRef: owned.call.toolRef,
    providerRef: eligible.booking.providerRef, environment: owned.call.environment, reason: paidCallReportReason,
    booking: eligible.booking, originalSettlementRefs: [...eligible.originalSettlementRefs], originalResolution: eligible.resolution }
  const id = await ctx.db.insert('paidCallReports', { ...material, reportDigest: canonicalDigest(material),
    state: 'pending', nextWorkAt: now, createdAt: now, updatedAt: now })
  await recordMarketEvidenceFact(ctx, 'ae_answer_reported', reportRef, now, { toolRef: owned.call.toolRef, reporterRef: owned.actor.canonicalPrincipalRef })
  const row = await ctx.db.get(id)
  if (row === null) throw new Error('paid_call_report_missing_after_insert')
  return reportView(row, now)
}
