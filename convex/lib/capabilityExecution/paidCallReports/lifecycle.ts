import { financialEnvironmentMatches, financialEnvironmentValue } from '../../money/formance/contracts'
import { v } from 'convex/values'
import { env, type ActionCtx, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { api, internal } from '../../../_generated/api'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { managedCallBookingValue, settledSaleRefundReferences } from '@/modules/money/public'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { paidCallReportViewValue, type PaidCallReportView } from '@/modules/capability-execution/paid-call-report'
import { bookingFromRows } from '../../money/managedCall/booking'
import { restorePromotionalCredit } from '../../money/promotionalCredit/allocation'
import { upsertCallProjection } from '../callLifecycle/dispatchProjection'
import { materializePurchaseResolutionRecord, readPurchaseResolutionByCallRef } from '../callLifecycle/purchaseResolutionMaterialize'
import { bindWorkloadCronActionContext } from '../../platform/workloadCron/consequence'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue, type WorkloadCronSnapshot } from '../../platform/workloadCron/context'
import { callArgs } from './admission'

const workValue = v.object({ expectedEnvironment: financialEnvironmentValue, booking: managedCallBookingValue, originalSettlementRefs: v.array(v.string()), reportDigest: v.string() })
export const claimResult = v.union(v.null(), workValue)
export async function claimHandler(ctx: MutationCtx, args: { callRef: string }) {
  const row = await ctx.db.query('paidCallReports').withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  if (row?.state !== 'pending' || !financialEnvironmentMatches(row.environment)) return null
  const now = Date.now()
  if (row.nextWorkAt !== undefined && row.nextWorkAt > now) return null
  await ctx.db.patch(row._id, { nextWorkAt: now + 60_000, updatedAt: now })
  return { expectedEnvironment: row.environment, booking: row.booking, originalSettlementRefs: row.originalSettlementRefs, reportDigest: row.reportDigest }
}

export const finishArgs = v.object({ callRef: v.string(), reportDigest: v.string(), transactionRefs: v.array(v.string()) })
/** Confirmed native posting is the sole trigger for refunded receipt/usage.
 * Original paid Provider and output remain intact. The report retains prior
 * settlement/resolution evidence, and retry cannot restore promo counters twice. */
export async function finishHandler(ctx: MutationCtx, args: { callRef: string; reportDigest: string; transactionRefs: string[] }): Promise<boolean> {
  const report = await ctx.db.query('paidCallReports').withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  if (report === null || !financialEnvironmentMatches(report.environment) || report.reportDigest !== args.reportDigest
    || JSON.stringify(settledSaleRefundReferences(report.booking)) !== JSON.stringify(args.transactionRefs)) return false
  if (report.state === 'posted') return JSON.stringify(report.transactionRefs) === JSON.stringify(args.transactionRefs)
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  if (call?.state !== 'completed' || call.environment !== report.environment || call.result?.kind !== 'completed' || call.quoteRef === undefined
    || call.formanceFinancialState !== 'settled' || call.ownerId !== report.accountRef
    || call.result.receipt?.commercialModel !== 'account_aud' || call.result.receipt.state !== 'settled'
    || JSON.stringify(call.formanceSettlementRefs) !== JSON.stringify(report.originalSettlementRefs)) return false
  const quoteRef = call.quoteRef
  const quote = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  const booking = quote === null ? null : bookingFromRows(call, quote)
  if (booking === null || canonicalDigest(booking) !== canonicalDigest(report.booking)) return false
  const now = Date.now()
  const transactionRef = args.transactionRefs[0]
  if (transactionRef === undefined) return false
  if (call.promotionalCreditAllocation !== undefined) {
    const restored = await restorePromotionalCredit(ctx, call.promotionalCreditAllocation, call.ownerId, call.environment, now)
    if (restored.kind !== 'restored') throw new Error('paid_call_report_promotional_restore_failed')
  }
  const previousUsage = call.usage ?? call.result.usage
  const usage = previousUsage === undefined ? undefined : { ...previousUsage, chargeState: 'refunded' as const, transactionRef, observedAt: now }
  const result = { ...call.result, ...(usage === undefined ? {} : { usage }), receipt: { ...call.result.receipt,
    state: 'refunded' as const, refundState: 'released' as const, transactionRef,
    accountingTransactionRefs: [...report.originalSettlementRefs, ...args.transactionRefs],
  } }
  const projection = { state: 'completed' as const, dispatchState: 'completed' as const, result, ...(usage === undefined ? {} : { usage }) }
  await ctx.db.patch(call._id, { result, ...(usage === undefined ? {} : { usage }),
    formanceFinancialState: 'released', formanceReleaseRefs: [...args.transactionRefs], updatedAt: now })
  await materializePurchaseResolutionRecord(ctx, call, projection, now, { expectedRecordDigest: report.originalResolution.recordDigest })
  const resolution = await readPurchaseResolutionByCallRef(ctx, call.callRef)
  if (resolution?.terminalState !== 'refunded') throw new Error('paid_call_report_resolution_missing')
  await upsertCallProjection(ctx, call, projection, now)
  const { _id, _creationTime: _created, nextWorkAt: _next, ...before } = report
  void _created
  void _next
  await ctx.db.replace(_id, { ...before, state: 'posted', buyerRefundTransactionRef: transactionRef, transactionRefs: [...args.transactionRefs], postedAt: now, updatedAt: now })
  return true
}

export async function processHandler(ctx: ActionCtx, args: { callRef: string }): Promise<boolean> {
  const work = await ctx.runMutation(internal.capabilityCallReports.claimWork, args)
  if (work === null) return true
  try {
    const result = await ctx.runAction(internal.moneyFormance.refundSettledSale, work)
    if (result.kind !== 'completed') return false
    return await ctx.runMutation(internal.capabilityCallReports.finishWork, { callRef: args.callRef, reportDigest: work.reportDigest, transactionRefs: [...result.transactionRefs] })
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'processPaidCallReport', reason: 'source_unavailable' })
  }
}

export async function reportOwnerHandler(ctx: ActionCtx, args: { callRef: string }): Promise<PaidCallReportView> {
  const admitted: PaidCallReportView = await ctx.runMutation(internal.capabilityCallReports.admit, args)
  if (admitted.kind !== 'pending') return admitted
  await processHandler(ctx, args)
  return await ctx.runQuery(api.capabilityCallReports.readOwner, args)
}

export const dueArgs = v.object({ now: v.number() })
export async function dueHandler(ctx: QueryCtx, args: { now: number }): Promise<string[]> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return []
  return (await ctx.db.query('paidCallReports').withIndex('by_environment_and_state_and_nextWorkAt', q =>
    q.eq('environment', environment).eq('state', 'pending').lte('nextWorkAt', args.now)).take(25)).map(row => row.callRef)
}
export const sweepArgs = v.object({ workload: workloadCronSnapshotValue })
export async function sweepHandler(ctx: ActionCtx, args: { workload: WorkloadCronSnapshot }): Promise<number> {
  const snapshot = await ctx.runQuery(internal.workloadCron.reconcile, { name: 'reconcile paid Call reports', snapshot: parseWorkloadCronSnapshot(args.workload) })
  const admitted = bindWorkloadCronActionContext(ctx, { name: 'reconcile paid Call reports', snapshot })
  const due = await ctx.runQuery(internal.capabilityCallReports.due, { now: Date.now() })
  for (const callRef of due) await processHandler(admitted, { callRef })
  return due.length
}

export { callArgs, paidCallReportViewValue }
