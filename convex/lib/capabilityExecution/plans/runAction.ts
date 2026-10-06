import type { Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { synchronizeSpendingPeriods } from '../quotes/prepareSpendingPeriods'
import { readOrganizationMonthlySpendForReserve } from '../callLifecycle/callFinancialReservation'
import { claimHoldResult } from './holdLifecycle'
import { beginRunResult, runArgsValue } from './runAdmission'
import type { PlanRunResult } from './planState'

async function prepareAndClaim(ctx: ActionCtx, planRef: string): Promise<Infer<typeof claimHoldResult>> {
  const prepared = await ctx.runMutation(internal.capabilityPlans.prepareRun, { planRef })
  if (prepared.kind === 'refused' || prepared.subjects.kind === 'refused') {
    await ctx.runMutation(internal.capabilityPlans.failPreparation, { planRef,
      code: prepared.kind === 'refused' ? prepared.code : prepared.subjects.kind === 'refused' ? prepared.subjects.code : 'hold_unavailable' })
    return { kind: 'stopped' }
  }
  const subjects = prepared.subjects
  let spendingPeriods = subjects.spendingPeriods
  if (subjects.financialMode === 'formance') {
    const periods = await synchronizeSpendingPeriods(ctx, subjects, prepared.principal, prepared.rootToolRef)
    if (periods.kind !== 'prepared') {
      await ctx.runMutation(internal.capabilityPlans.failPreparation, { planRef, code: periods.reason })
      return { kind: 'stopped' }
    }
    spendingPeriods = periods.spendingPeriods
    const synced = await ctx.runAction(internal.moneyFormance.syncCapacity, {
      commandRef: `capacity:legal:${subjects.legalCustomerRef}:${subjects.legalCustomerGeneration}`,
      idempotencyKey: `capacity:legal:${subjects.legalCustomerRef}:${subjects.legalCustomerGeneration}`,
      kind: 'legal_customer_exposure', subjectRef: subjects.legalCustomerRef, generation: subjects.legalCustomerGeneration,
      targetUnits: subjects.legalExposureUnits, policyDigest: subjects.policyDigest,
      externalEvidenceDigest: subjects.policyDigest, expectedEnvironment: subjects.expectedEnvironment,
    })
    if (synced.kind !== 'completed') {
      await ctx.runMutation(internal.capabilityPlans.failPreparation, { planRef, code: 'hold_unavailable' })
      return { kind: 'stopped' }
    }
  }
  const account = subjects.financialMode === 'none' ? { kind: 'available' as const, units: '0', observedAt: Date.now() }
    : await ctx.runAction(internal.moneyAccountCreditBalance.read, { accountRef: subjects.accountRef })
  if (account.kind !== 'available') {
    await ctx.runMutation(internal.capabilityPlans.failPreparation, { planRef, code: 'hold_unavailable' })
    return { kind: 'stopped' }
  }
  const organizationMonthlySpend = await readOrganizationMonthlySpendForReserve(ctx, subjects.accountRef)
  return await ctx.runMutation(internal.capabilityPlans.claimHold, {
    planRef, subjects, accountAvailableUnits: account.units, observedAt: account.observedAt,
    ...(spendingPeriods === undefined ? {} : { spendingPeriods }),
    ...(organizationMonthlySpend === undefined ? {} : { organizationMonthlySpend }),
  })
}

/** Only the immutable Hold command may repeat. No purchase or provider dispatch occurs here. */
export async function continueRunHandler(ctx: ActionCtx, { planRef }: { planRef: string }): Promise<null> {
  const recovery = await ctx.runMutation(internal.capabilityPlans.claimHoldRecovery, { planRef })
  const claim = recovery.kind === 'prepare' ? await prepareAndClaim(ctx, planRef) : recovery
  if (claim.kind !== 'claimed') return null
  try {
    const result = claim.booking === undefined ? { kind: 'completed' as const, transactionRefs: [], replayed: false }
      : await ctx.runAction(internal.moneyFormance.reservePlanHold, { ...claim.booking, expectedEnvironment: claim.expectedEnvironment })
    await ctx.runMutation(internal.capabilityPlans.attachHold, { planRef, generation: claim.generation, result })
  } catch {
    await ctx.runMutation(internal.capabilityPlans.attachHold, { planRef, generation: claim.generation,
      result: { kind: 'outcome_unknown', reference: `plan-hold:${planRef}`, statusRef: `plan:${planRef}` } })
  }
  return null
}

export async function runActionHandler(ctx: ActionCtx, args: Infer<typeof runArgsValue>): Promise<PlanRunResult> {
  const begin = await ctx.runMutation(internal.capabilityPlans.beginRun, args)
  return completeRunAdmission(ctx, begin)
}

export async function completeRunAdmission(ctx: ActionCtx, begin: Infer<typeof beginRunResult>): Promise<PlanRunResult> {
  if (begin.kind === 'refused') return begin
  if (begin.kind === 'ready') await continueRunHandler(ctx, { planRef: begin.planRef })
  const progress = await ctx.runQuery(internal.capabilityPlans.readProgress, { planRef: begin.planRef })
  if (progress === null) return { kind: 'refused', code: 'plan_not_found' }
  return { kind: begin.kind === 'ready' ? 'running' : begin.kind, planRef: begin.planRef, state: progress.state }
}
