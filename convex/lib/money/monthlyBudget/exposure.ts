import type { Infer } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { managedCallBuyerSaleReference } from '@/modules/money/public'
import { currentUtcMonthBounds } from '@/modules/common/freshness'
import { accountExposureArgs, type AccountExposure, MAX_MONTHLY_EXPOSURE_SOURCES, validExposureUnits } from './exposureContracts'

type Scope = { [K in keyof typeof accountExposureArgs]: Infer<typeof accountExposureArgs[K]> }
type Call = Doc<'capabilityCalls'>
type Plan = Doc<'capabilityPlans'>
type Reader = Pick<QueryCtx, 'db'>
type Available = Extract<AccountExposure, { kind: 'available' }>
const LIMIT = MAX_MONTHLY_EXPOSURE_SOURCES
const CARRY_STATES = [undefined, 'reservation_pending', 'reserved', 'possibly_submitted', 'outcome_unknown'] as const

async function readCalls(ctx: Reader, scope: Scope, start: number, end: number): Promise<Call[] | null> {
  // Include terminal current-month Calls: a purchase can begin AND settle while
  // the action is reading Formance. Pending-only fingerprints have an ABA race.
  const current = await ctx.db.query('capabilityCalls').withIndex('by_ownerId_and_environment_and_createdAt', q =>
    q.eq('ownerId', scope.accountRef).eq('environment', scope.environment).gte('createdAt', start).lt('createdAt', end)).take(LIMIT + 1)
  if (current.length > LIMIT) return null
  const calls = new Map(current.map(call => [call.callRef, call]))
  for (const state of CARRY_STATES) {
    // Skip proven-zero old Calls without scanning a lifetime of free usage.
    // Missing legacy price projections are still inspected, never assumed zero.
    for (const side of ['lt', 'gt'] as const) {
      const carry = await ctx.db.query('capabilityCalls').withIndex('by_ownerId_environment_formanceFinancialState_buyerAmountUnits', q => {
        const account = q.eq('ownerId', scope.accountRef).eq('environment', scope.environment).eq('formanceFinancialState', state)
        return side === 'lt' ? account.lt('buyerAmountUnits', '0') : account.gt('buyerAmountUnits', '0')
      }).take(LIMIT + 1)
      if (carry.length > LIMIT) return null
      for (const call of carry) calls.set(call.callRef, call)
      if (calls.size > LIMIT) return null
    }
  }
  return [...calls.values()]
}

async function readPlans(ctx: Reader, scope: Scope): Promise<Plan[] | null> {
  const current = await ctx.db.query('capabilityPlans').withIndex('by_accountRef_and_environment_and_organizationMonth', q =>
    q.eq('accountRef', scope.accountRef).eq('environment', scope.environment).eq('organizationMonth', scope.organizationMonth)).take(LIMIT + 1)
  if (current.length > LIMIT) return null
  const plans = new Map(current.filter(plan => plan.environment === scope.environment).map(plan => [plan.planRef, plan]))
  // Positive and missing/malformed exposure must remain visible irrespective of
  // delivery state. A Hold can be claimed while still quoted/awaiting_approval.
  for (const side of ['lt', 'gt'] as const) {
    const carry = await ctx.db.query('capabilityPlans').withIndex('by_accountRef_environment_organizationMonthlyExposureUnits', q => {
      const account = q.eq('accountRef', scope.accountRef).eq('environment', scope.environment)
      return side === 'lt' ? account.lt('organizationMonthlyExposureUnits', '0') : account.gt('organizationMonthlyExposureUnits', '0')
    }).take(LIMIT + 1)
    if (carry.length > LIMIT) return null
    for (const plan of carry) plans.set(plan.planRef, plan)
    if (plans.size > LIMIT) return null
  }
  return [...plans.values()]
}

function planExposure(plan: Plan): string | undefined {
  const untouched = ['quoted', 'awaiting_approval', 'expired', 'cancelled', 'failed'].includes(plan.state)
    && plan.holdReservationAttempt === undefined && plan.holdReservationRefs === undefined && plan.holdBooking === undefined
  if (untouched && (plan.organizationMonthlyExposureUnits === undefined || plan.organizationMonthlyExposureUnits === '0')) return '0'
  const units = plan.organizationMonthlyExposureUnits
  if (!validExposureUnits(units) || !validExposureUnits(plan.approvedTotalAudUnits)
    || BigInt(units) > BigInt(plan.approvedTotalAudUnits)
    || (plan.holdReleaseRefs !== undefined && units !== '0')
    || (plan.holdCreditRestored === true && units !== '0')
    || plan.organizationMonth === undefined) return undefined
  return units
}

function callFingerprint(call: Call): string {
  return canonicalDigest({
    id: call._id, callRef: call.callRef, quoteRef: call.quoteRef ?? null, principal: call.principalId, units: call.buyerAmountUnits ?? null,
    planRef: call.planRef ?? null, node: call.planNodeId ?? null, state: call.state,
    financialState: call.formanceFinancialState ?? null, reservation: call.formanceReservationRefs ?? null,
    settlement: call.formanceSettlementRefs ?? null, sale: call.buyerSaleTransactionRef ?? null,
    release: call.formanceReleaseRefs ?? null, allocation: call.planAllocation ?? null,
  })
}

async function callSaleAllocation(ctx: Reader, call: Call, groupRef: string, groupUnits: string): Promise<
  { kind: 'available'; allocation?: Available['saleAllocations'][number]; digest: string } | { kind: 'unavailable' }
> {
  if (call.quoteRef === undefined) return { kind: 'unavailable' }
  const quoteRef = call.quoteRef
  const quote = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  // The accepted Quote owns gross price, including promotional consideration.
  // Never infer it from a Charge, formatted price, current Tool or receipt state.
  if (quote === null || quote.accountRef !== call.ownerId || quote.environment !== call.environment
    || quote.principalId !== call.principalId || quote.consumedCallRef !== call.callRef || quote.state !== 'consumed'
    || quote.planRef !== call.planRef || quote.planNodeId !== call.planNodeId || !validExposureUnits(quote.decisionAudUnits)
    || (call.buyerAmountUnits !== undefined && call.buyerAmountUnits !== quote.decisionAudUnits)) return { kind: 'unavailable' }
  const digest = canonicalDigest({ call: call.callRef, quote: quote.quoteRef, units: quote.decisionAudUnits,
    material: quote.evidenceDigest, allocation: call.promotionalCreditAllocation ?? null })
  if (quote.decisionAudUnits === '0') return { kind: 'available', digest }
  const reference = managedCallBuyerSaleReference({ callRef: call.callRef, quoteRef })
  if (call.buyerSaleTransactionRef !== undefined && call.buyerSaleTransactionRef !== reference) return { kind: 'unavailable' }
  return { kind: 'available', digest, allocation: {
    reference, units: quote.decisionAudUnits, groupRef,
    groupUnits: groupRef === call.callRef ? quote.decisionAudUnits : groupUnits,
  } }
}

/** Complete bounded source union; incomplete evidence refuses new paid work.
 * This query is also called directly inside the consequential mutation. Its
 * indexed reads and that mutation's insertion/claim provide the OCC fence.
 * No quota ledger, replay identity or financial lifecycle is introduced.
 */
export async function readAccountExposureHandler(ctx: Reader, scope: Scope): Promise<AccountExposure> {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(scope.organizationMonth)) return { kind: 'unavailable' }
  const { periodStartAt, periodEndAt } = currentUtcMonthBounds(Date.parse(`${scope.organizationMonth}-01T00:00:00Z`))
  const calls = await readCalls(ctx, scope, periodStartAt, periodEndAt)
  const plans = await readPlans(ctx, scope)
  if (calls === null || plans === null) return { kind: 'unavailable' }
  const fingerprints: string[] = []
  const saleAllocations: Available['saleAllocations'] = []
  const seenCalls = new Set<string>()
  const planUnits = new Map<string, string>()
  let units = 0n
  for (const plan of plans) {
    const exposure = planExposure(plan)
    if (exposure === undefined || plan.ownerId !== scope.accountRef) return { kind: 'unavailable' }
    planUnits.set(plan.planRef, exposure)
    units += BigInt(exposure)
    fingerprints.push(canonicalDigest({
      id: plan._id, planRef: plan.planRef, state: plan.state, month: plan.organizationMonth ?? null,
      units: exposure, total: plan.approvedTotalAudUnits, concluded: plan.concludedNodeIds ?? [],
      booking: plan.holdBooking ?? null, attempt: plan.holdReservationAttempt ?? null,
      reservation: plan.holdReservationRefs ?? null, release: plan.holdReleaseRefs ?? null,
      creditRestored: plan.holdCreditRestored ?? null,
    }))
    if (exposure === '0') continue
    const nodes = await ctx.db.query('capabilityCalls').withIndex('by_planRef', q => q.eq('planRef', plan.planRef)).take(11)
    if (nodes.length > 10 || new Set(nodes.map(call => call.planNodeId)).size !== nodes.length) return { kind: 'unavailable' }
    const concluded = new Set(plan.concludedNodeIds ?? [])
    if (concluded.size !== (plan.concludedNodeIds ?? []).length) return { kind: 'unavailable' }
    for (const call of nodes) {
      if (call.ownerId !== scope.accountRef || call.environment !== scope.environment || call.planNodeId === undefined
        || !plan.nodes.some(node => node.nodeId === call.planNodeId)) return { kind: 'unavailable' }
      seenCalls.add(call.callRef)
      fingerprints.push(callFingerprint(call))
      if (concluded.has(call.planNodeId)) continue
      const allocation = await callSaleAllocation(ctx, call, plan.planRef, exposure)
      if (allocation.kind !== 'available') return { kind: 'unavailable' }
      fingerprints.push(allocation.digest)
      if (allocation.allocation !== undefined) saleAllocations.push(allocation.allocation)
    }
    if (seenCalls.size > LIMIT) return { kind: 'unavailable' }
  }
  for (const call of calls) {
    if (!seenCalls.has(call.callRef)) fingerprints.push(callFingerprint(call))
    const conclusive = call.formanceFinancialState === 'settled' || call.formanceFinancialState === 'released'
    if (conclusive) continue
    if (call.planRef !== undefined) {
      if (!seenCalls.has(call.callRef)) {
        const price = await callSaleAllocation(ctx, call, call.planRef, planUnits.get(call.planRef) ?? '0')
        if (price.kind !== 'available' || price.allocation !== undefined) return { kind: 'unavailable' }
        fingerprints.push(price.digest)
      }
      continue // Parent Hold already reserves the full Node allocation.
    }
    const allocation = await callSaleAllocation(ctx, call, call.callRef, '0')
    if (allocation.kind !== 'available') return { kind: 'unavailable' }
    fingerprints.push(allocation.digest)
    if (allocation.allocation !== undefined) {
      units += BigInt(allocation.allocation.units)
      saleAllocations.push(allocation.allocation)
    }
  }
  if (saleAllocations.length > LIMIT || new Set(saleAllocations.map(sale => sale.reference)).size !== saleAllocations.length) return { kind: 'unavailable' }
  return { kind: 'available', units: units.toString(),
    digest: canonicalDigest({ format: 'ae.account-monthly-exposure:v1', ...scope, sources: fingerprints.sort() }),
    saleAllocations,
  }
}
