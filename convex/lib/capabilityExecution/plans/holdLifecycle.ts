import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { MutationCtx } from '../../../_generated/server'
import { planHoldBookingValue, spendingPeriodsValue } from '@/modules/money/public'
import { claimPromotionalCredit, restorePromotionalCredit } from '../../money/promotionalCredit/allocation'
import { spendingPeriodsAreCurrent } from '../../money/spendingPeriods/periods'
import { moneyResult } from '../../money/formance/contracts'
import { financialSubjectsResult } from '../quotes/contracts'
import { organizationMonthlySpendReserveRefusal } from '../callLifecycle/admissionRefusal'
import { reserveArgs } from '../callLifecycle/admissionReservation'
import { readPlan, type Plan } from './planState'
import { validateRunPlan } from './runAdmission'

export const claimHoldArgsValue = v.object({
  planRef: v.string(), subjects: financialSubjectsResult, spendingPeriods: v.optional(spendingPeriodsValue),
  accountAvailableUnits: v.string(), observedAt: v.number(), organizationMonthlySpend: reserveArgs.organizationMonthlySpend,
})
export const claimHoldResult = v.union(
  v.object({ kind: v.literal('claimed'), generation: v.number(), expectedEnvironment: v.union(v.literal('sandbox'), v.literal('production')), booking: v.optional(planHoldBookingValue) }),
  v.object({ kind: v.union(v.literal('stopped'), v.literal('prepare')) }),
)

export async function failUnheldPlan(ctx: MutationCtx, plan: Plan, code: string): Promise<void> {
  if (plan.holdReservationAttempt !== undefined || plan.holdReservationRefs !== undefined) return
  await ctx.db.patch(plan._id, { state: plan.terminationIntent ?? 'failed', failureCode: code,
    organizationMonthlyExposureUnits: '0', updatedAt: Date.now() })
}

/** Freeze credit and capacity identity transactionally before the only native Hold command. */
export async function claimHoldHandler(ctx: MutationCtx, args: Infer<typeof claimHoldArgsValue>): Promise<Infer<typeof claimHoldResult>> {
  const plan = await readPlan(ctx, args.planRef)
  const now = Date.now()
  if (plan === null || plan.authority === undefined || plan.holdReleaseRefs !== undefined || plan.holdReservationRefs !== undefined) return { kind: 'stopped' }
  if (plan.holdReservationAttempt !== undefined || plan.holdCreditRestored === true) return { kind: 'stopped' }
  const validation = await validateRunPlan(ctx, plan, now)
  if (validation.kind === 'refused' || plan.terminationIntent !== undefined || plan.runDeadlineAt <= now) {
    await failUnheldPlan(ctx, plan, validation.kind === 'refused' ? validation.code : 'plan_expired')
    return { kind: 'stopped' }
  }
  const subjects = args.subjects
  if (subjects.kind !== 'prepared' || subjects.accountRef !== plan.accountRef || subjects.principalRef !== plan.principalId
    || subjects.expectedEnvironment !== plan.environment || subjects.policyDigest !== plan.commercialPolicyDigest
    || subjects.authorityDigest !== plan.grantDigest || now - args.observedAt > 15_000 || args.observedAt > now
    || !/^(?:0|[1-9]\d{0,15})$/u.test(args.accountAvailableUnits)
    || BigInt(args.accountAvailableUnits) < BigInt(plan.approvedTotalAudUnits)) {
    await failUnheldPlan(ctx, plan, 'total_exceeds_available')
    return { kind: 'stopped' }
  }
  if (plan.approvedTotalAudUnits !== '0') {
    const period = args.spendingPeriods
    if (period === undefined || !await spendingPeriodsAreCurrent(ctx, {
      principalRef: plan.principalId, dailyLimitUnits: subjects.dailyLimitUnits, monthlyLimitUnits: subjects.monthlyLimitUnits,
      now, spendingPeriods: period,
    })) {
      await failUnheldPlan(ctx, plan, 'hold_unavailable')
      return { kind: 'stopped' }
    }
    const binding = await ctx.db.query('moneyLegalCustomerBindings').withIndex('by_accountRef', q => q.eq('accountRef', plan.accountRef)).unique()
    if (binding?.legalCustomerRef !== subjects.legalCustomerRef || binding.version !== subjects.legalCustomerGeneration) {
      await failUnheldPlan(ctx, plan, 'hold_unavailable')
      return { kind: 'stopped' }
    }
    for (const [scopeType, scopeRef] of [['account', plan.accountRef], ['legal_customer', subjects.legalCustomerRef]] as const) {
      const locked = await ctx.db.query('moneyReconciliationCases').withIndex('by_scopeType_and_scopeRef_and_status', q =>
        q.eq('scopeType', scopeType).eq('scopeRef', scopeRef).eq('status', 'open')).first()
      if (locked !== null) { await failUnheldPlan(ctx, plan, 'hold_unavailable'); return { kind: 'stopped' } }
    }
    const monthly = await organizationMonthlySpendReserveRefusal(ctx, {
      ownerId: plan.accountRef, now, ...(args.organizationMonthlySpend === undefined ? {} : { organizationMonthlySpend: args.organizationMonthlySpend }),
    }, { decisionAudUnits: plan.approvedTotalAudUnits })
    if (monthly !== null) { await failUnheldPlan(ctx, plan, 'total_exceeds_available'); return { kind: 'stopped' } }
    const credit = await claimPromotionalCredit(ctx, { accountRef: plan.accountRef, environment: plan.environment, amountUnits: plan.approvedTotalAudUnits, now })
    if (credit.kind !== 'claimed') { await failUnheldPlan(ctx, plan, 'hold_unavailable'); return { kind: 'stopped' } }
    const booking: Infer<typeof planHoldBookingValue> = {
      planRef: plan.planRef, planDigest: plan.planDigest, idempotencyKey: `plan-hold:${plan.planRef}`,
      accountRef: plan.accountRef, principalRef: plan.principalId, legalCustomerRef: subjects.legalCustomerRef,
      legalCustomerGeneration: subjects.legalCustomerGeneration, approvedTotalUnits: plan.approvedTotalAudUnits,
      spendingPeriods: period, promotionalCreditAllocation: { ...credit.allocation, grants: [...credit.allocation.grants] },
    }
    await ctx.db.patch(plan._id, { holdBooking: booking, holdRemainingCreditAllocation: booking.promotionalCreditAllocation,
      organizationMonth: new Date(period.monthly.periodStartAt).toISOString().slice(0, 7),
      organizationMonthlyExposureUnits: plan.approvedTotalAudUnits,
      holdReservationAttempt: { generation: 1, ambiguous: false, leaseUntil: now + 60_000 }, updatedAt: now })
    await ctx.scheduler.runAfter(65_000, internal.capabilityPlans.continueRun, { planRef: plan.planRef })
    return { kind: 'claimed', generation: 1, expectedEnvironment: plan.environment, booking }
  }
  await ctx.db.patch(plan._id, { holdReservationAttempt: { generation: 1, ambiguous: false, leaseUntil: now + 60_000 }, updatedAt: now })
  await ctx.scheduler.runAfter(65_000, internal.capabilityPlans.continueRun, { planRef: plan.planRef })
  return { kind: 'claimed', generation: 1, expectedEnvironment: plan.environment }
}

export const attachHoldArgsValue = v.object({ planRef: v.string(), generation: v.number(), result: moneyResult })
export async function attachHoldHandler(ctx: MutationCtx, args: Infer<typeof attachHoldArgsValue>): Promise<null> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.authority === undefined || plan.holdReservationRefs !== undefined
    || plan.holdReservationAttempt?.generation !== args.generation) return null
  const now = Date.now()
  if (args.result.kind === 'completed') {
    if (plan.approvedTotalAudUnits !== '0' && args.result.transactionRefs.length === 0) throw new Error('plan_hold_evidence_missing')
    await ctx.db.patch(plan._id, { holdReservationRefs: args.result.transactionRefs, state: 'running', updatedAt: now })
    await ctx.scheduler.runAfter(0, internal.capabilityPlans.startWorkflow, { planRef: plan.planRef })
  } else if (args.result.kind === 'outcome_unknown' || plan.holdReservationAttempt.ambiguous) {
    await ctx.db.patch(plan._id, { state: 'reconciliation_required', failureCode: 'hold_outcome_unknown',
      holdReservationAttempt: { ...plan.holdReservationAttempt, ambiguous: true }, updatedAt: now })
  } else {
    if (plan.holdBooking?.promotionalCreditAllocation !== undefined) {
      const restored = await restorePromotionalCredit(ctx, plan.holdBooking.promotionalCreditAllocation, plan.accountRef, plan.environment, now)
      if (restored.kind !== 'restored') throw new Error('plan_credit_restore_failed')
    }
    await ctx.db.patch(plan._id, { state: plan.terminationIntent ?? 'failed', failureCode: args.result.code,
      holdCreditRestored: true, holdRemainingCreditAllocation: undefined, organizationMonthlyExposureUnits: '0', updatedAt: now })
  }
  return null
}

export async function failPreparationHandler(ctx: MutationCtx, args: { planRef: string; code: string }): Promise<null> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan !== null) await failUnheldPlan(ctx, plan, args.code)
  return null
}


export async function claimHoldRecoveryHandler(ctx: MutationCtx, args: { planRef: string }): Promise<Infer<typeof claimHoldResult>> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.authority === undefined || plan.holdCreditRestored === true
    || plan.holdReleaseRefs !== undefined || plan.holdReservationRefs !== undefined) return { kind: 'stopped' }
  const attempt = plan.holdReservationAttempt
  if (attempt === undefined) return ['running', 'reconciliation_required'].includes(plan.state) ? { kind: 'prepare' } : { kind: 'stopped' }
  const now = Date.now()
  if (attempt.leaseUntil > now || attempt.generation >= 5
    || (plan.approvedTotalAudUnits !== '0' && plan.holdBooking === undefined)) return { kind: 'stopped' }
  const generation = attempt.generation + 1
  await ctx.db.patch(plan._id, { holdReservationAttempt: { generation, ambiguous: true, leaseUntil: now + 60_000 }, updatedAt: now })
  await ctx.scheduler.runAfter(65_000, internal.capabilityPlans.continueRun, { planRef: plan.planRef })
  return { kind: 'claimed', generation, expectedEnvironment: plan.environment,
    ...(plan.holdBooking === undefined ? {} : { booking: plan.holdBooking }) }
}
