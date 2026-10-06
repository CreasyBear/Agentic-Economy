import { digestReference, digestValue, stripDigest, planHoldAccountAddress, planPromotionalHoldAccountAddress } from './formance-digest'
import { canonicalFormanceUnits, formanceMonetaryVariable, type FormanceMoneyCommand } from '../formance'
import { PLAN_FORMANCE_SCHEMA_VERSION } from '../formance-schema'
import { promotionalPurchasedAmounts, type PromotionalCreditAllocation } from '../promotional-credit-contracts'
import { refused } from '../formance-result'
import {
  validPromotionalCreditAllocation, promotionalGrantAccount, boundedReference, positiveGeneration, validSpendingPeriod, formanceSpendingPeriodAccount,
  formanceReference, preparedBulk, type FormanceManagedCallSpendingPeriods, type PreparedManagedCallBulk,
} from './formance-transaction-templates'

export { planHoldAccountAddress, planPromotionalHoldAccountAddress } from './formance-digest'

const SHA256 = /^sha256:[a-f0-9]{64}$/u

export type PlanHoldBooking = Readonly<{
  planRef: string
  planDigest: string
  idempotencyKey: string
  accountRef: string
  principalRef: string
  legalCustomerRef: string
  legalCustomerGeneration: number
  approvedTotalUnits: string
  spendingPeriods: FormanceManagedCallSpendingPeriods
  promotionalCreditAllocation?: PromotionalCreditAllocation
}>

export type PlanNodeAllocation = PlanHoldBooking & Readonly<{
  nodeId: string
  callRef: string
  nodeCeilingUnits: string
  amountUnits: string
}>

export type PlanNodeSettlement = PlanNodeAllocation & Readonly<{
  buyerRevenueUnits: string
  buyerTaxUnits: string
  externalEvidenceDigest: string
}>

export type PlanNodeRelease = PlanNodeAllocation & Readonly<{
  externalEvidenceDigest: string
}> & (
  | Readonly<{ submissionProvenAbsent: true; authorizationProvenExpiredUnused?: never }>
  | Readonly<{ authorizationProvenExpiredUnused: true; submissionProvenAbsent?: never }>
)

export type PlanRelease = PlanHoldBooking & Readonly<{
  /** Frozen remainder, confirmed against every native Hold balance before release. */
  holdBalanceUnits: string
  remainingCreditAllocation?: PromotionalCreditAllocation
  /** Caller-owned terminal gate: every Node Call is financially conclusive. */
  allNodeCallsFinanciallyConclusive: true
  terminalEvidenceDigest: string
}>

export function preparePlanHold(input: PlanHoldBooking): PreparedManagedCallBulk {
  if (!validPlanHoldBooking(input) || !validCredit(input, input.approvedTotalUnits)) return refused('formance_plan_hold_input_invalid')
  // Finalization adds evidence and remainder fields; they are not part of the
  // original Hold command and must not change its historical evidence digest.
  input = {
    planRef: input.planRef, planDigest: input.planDigest, idempotencyKey: input.idempotencyKey,
    accountRef: input.accountRef, principalRef: input.principalRef, legalCustomerRef: input.legalCustomerRef,
    legalCustomerGeneration: input.legalCustomerGeneration, approvedTotalUnits: input.approvedTotalUnits,
    spendingPeriods: input.spendingPeriods,
    ...(input.promotionalCreditAllocation === undefined ? {} : { promotionalCreditAllocation: input.promotionalCreditAllocation }),
  }
  const amount = formanceMonetaryVariable('AUD', input.approvedTotalUnits)
  const purchased = `AUD/6 ${input.promotionalCreditAllocation?.purchasedUnits ?? input.approvedTotalUnits}`
  if (amount === undefined) return refused('formance_plan_hold_input_invalid')
  const legal = planLegalExposureAccounts(input.legalCustomerRef, input.legalCustomerGeneration)
  const periods = planSpendingPeriodAccounts(input.principalRef, input.spendingPeriods)
  return preparedBulk([
    planMoneyCommand(input, 'hold', 'PLAN_HOLD_RESERVED_AUD', {
      account_available: `accounts:${digestReference('account', input.accountRef)}:available`,
      plan_hold: planHoldAccountAddress(input),
      legal_available: legal.available,
      legal_reserved: legal.reserved,
      daily_available: periods.dailyAvailable,
      daily_reserved: periods.dailyReserved,
      monthly_available: periods.monthlyAvailable,
      monthly_reserved: periods.monthlyReserved,
      buyer_amount: purchased,
      exposure_amount: amount,
      daily_amount: amount,
      monthly_amount: amount,
    }, input.planDigest),
    ...planPromotionalCommands(input, 'hold', input.planDigest),
  ])
}

export function preparePlanNodeAllocation(input: PlanNodeAllocation): PreparedManagedCallBulk {
  if (!validPlanNodeAllocation(input)) return refused('formance_plan_node_allocation_input_invalid')
  const amount = formanceMonetaryVariable('AUD', input.amountUnits)
  if (amount === undefined) return refused('formance_plan_node_allocation_input_invalid')
  return preparedBulk([
    planMoneyCommand(input, 'node-allocation', 'PLAN_NODE_ALLOCATED_AUD', {
      plan_hold: planHoldAccountAddress(input),
      call_reserved: `calls:${digestReference('call', input.callRef)}:buyer_reserved`,
      buyer_amount: `AUD/6 ${input.promotionalCreditAllocation?.purchasedUnits ?? input.amountUnits}`,
    }, input.planDigest, input.nodeId),
    ...planPromotionalCommands(input, 'allocate', input.planDigest, input),
  ])
}

export function preparePlanNodeSettlement(input: PlanNodeSettlement): PreparedManagedCallBulk {
  if (!validPlanNodeSettlement(input)) return refused('formance_plan_node_settlement_input_invalid')
  const split = promotionalPurchasedAmounts(input.amountUnits, input.buyerTaxUnits, input.promotionalCreditAllocation?.purchasedUnits ?? input.amountUnits)
  const revenue = split === undefined ? undefined : formanceMonetaryVariable('AUD', split.revenueUnits, true)
  const tax = split === undefined ? undefined : formanceMonetaryVariable('AUD', split.taxUnits, true)
  const amount = formanceMonetaryVariable('AUD', input.amountUnits)
  if (revenue === undefined || tax === undefined || amount === undefined) {
    return refused('formance_plan_node_settlement_input_invalid')
  }
  const legal = planLegalExposureAccounts(input.legalCustomerRef, input.legalCustomerGeneration)
  const periods = planSpendingPeriodAccounts(input.principalRef, input.spendingPeriods)
  return preparedBulk([
    planMoneyCommand(input, 'node-settlement', 'PLAN_NODE_SETTLED_AUD', {
      call_reserved: `calls:${digestReference('call', input.callRef)}:buyer_reserved`,
      revenue: 'platform:revenue:sales',
      tax: 'platform:tax:gst',
      legal_reserved: legal.reserved,
      legal_settled: legal.settled,
      daily_reserved: periods.dailyReserved,
      daily_spent: periods.dailySpent,
      monthly_reserved: periods.monthlyReserved,
      monthly_spent: periods.monthlySpent,
      revenue_amount: revenue,
      tax_amount: tax,
      exposure_amount: amount,
      daily_amount: amount,
      monthly_amount: amount,
    }, input.externalEvidenceDigest, input.nodeId),
    ...planPromotionalCommands(input, 'settle', input.externalEvidenceDigest, input),
  ])
}

export function preparePlanNodeRelease(input: PlanNodeRelease): PreparedManagedCallBulk {
  if (!validPlanNodeRelease(input)) return refused('formance_plan_node_release_input_invalid')
  const amount = formanceMonetaryVariable('AUD', input.amountUnits)
  if (amount === undefined) return refused('formance_plan_node_release_input_invalid')
  const legal = planLegalExposureAccounts(input.legalCustomerRef, input.legalCustomerGeneration)
  const periods = planSpendingPeriodAccounts(input.principalRef, input.spendingPeriods)
  return preparedBulk([
    planMoneyCommand(input, 'node-release', 'PLAN_NODE_RELEASED_AUD', {
      account_available: `accounts:${digestReference('account', input.accountRef)}:available`,
      call_reserved: `calls:${digestReference('call', input.callRef)}:buyer_reserved`,
      legal_available: legal.available,
      legal_reserved: legal.reserved,
      daily_available: periods.dailyAvailable,
      daily_reserved: periods.dailyReserved,
      monthly_available: periods.monthlyAvailable,
      monthly_reserved: periods.monthlyReserved,
      buyer_amount: `AUD/6 ${input.promotionalCreditAllocation?.purchasedUnits ?? input.amountUnits}`,
      exposure_amount: amount,
      daily_amount: amount,
      monthly_amount: amount,
    }, input.externalEvidenceDigest, input.nodeId),
    ...planPromotionalCommands(input, 'release-node', input.externalEvidenceDigest, input),
  ])
}

export function preparePlanRemainderRelease(input: PlanRelease): PreparedManagedCallBulk {
  if (!validPlanRelease(input)) return refused('formance_plan_release_input_invalid')
  const amount = formanceMonetaryVariable('AUD', input.holdBalanceUnits)
  if (amount === undefined) return refused('formance_plan_release_input_invalid')
  const legal = planLegalExposureAccounts(input.legalCustomerRef, input.legalCustomerGeneration)
  const periods = planSpendingPeriodAccounts(input.principalRef, input.spendingPeriods)
  return preparedBulk([
    planMoneyCommand(input, 'remainder-release', 'PLAN_REMAINDER_RELEASED_AUD', {
      account_available: `accounts:${digestReference('account', input.accountRef)}:available`,
      plan_hold: planHoldAccountAddress(input),
      legal_available: legal.available,
      legal_reserved: legal.reserved,
      daily_available: periods.dailyAvailable,
      daily_reserved: periods.dailyReserved,
      monthly_available: periods.monthlyAvailable,
      monthly_reserved: periods.monthlyReserved,
      buyer_amount: `AUD/6 ${input.remainingCreditAllocation?.purchasedUnits ?? input.holdBalanceUnits}`,
      exposure_amount: amount,
      daily_amount: amount,
      monthly_amount: amount,
    }, input.terminalEvidenceDigest),
    ...planPromotionalCommands({ ...input, ...(input.remainingCreditAllocation === undefined ? {} : {
      promotionalCreditAllocation: input.remainingCreditAllocation,
    }) }, 'release-remainder', input.terminalEvidenceDigest),
  ])
}

function validPlanHoldBooking(input: PlanHoldBooking): boolean {
  return validPlanMoneyIdentity(input)
    && boundedReference(input.principalRef)
    && boundedReference(input.legalCustomerRef)
    && positiveGeneration(input.legalCustomerGeneration)
    && canonicalFormanceUnits(input.approvedTotalUnits) !== undefined
    && validPlanSpendingPeriods(input.principalRef, input.spendingPeriods)
}

function validPlanNodeAllocation(input: PlanNodeAllocation): boolean {
  return validPlanHoldBooking(input)
    && boundedReference(input.nodeId)
    && boundedReference(input.callRef)
    && canonicalFormanceUnits(input.nodeCeilingUnits) !== undefined
    && canonicalFormanceUnits(input.amountUnits) !== undefined
    && BigInt(input.amountUnits) <= BigInt(input.nodeCeilingUnits)
    && BigInt(input.amountUnits) <= BigInt(input.approvedTotalUnits)
    && validCredit(input, input.amountUnits)
}

function validPlanNodeSettlement(input: PlanNodeSettlement): boolean {
  return validPlanNodeAllocation(input)
    && SHA256.test(input.externalEvidenceDigest)
    && canonicalFormanceUnits(input.buyerRevenueUnits) !== undefined
    && canonicalFormanceUnits(input.buyerTaxUnits, false) !== undefined
    && BigInt(input.buyerRevenueUnits) + BigInt(input.buyerTaxUnits) === BigInt(input.amountUnits)
}

function validPlanNodeRelease(input: PlanNodeRelease): boolean {
  return validPlanNodeAllocation(input)
    && SHA256.test(input.externalEvidenceDigest)
    && (input.submissionProvenAbsent === true || input.authorizationProvenExpiredUnused === true)
}

function validPlanRelease(input: PlanRelease): boolean {
  return validPlanHoldBooking(input)
    && canonicalFormanceUnits(input.holdBalanceUnits) !== undefined
    && BigInt(input.holdBalanceUnits) <= BigInt(input.approvedTotalUnits)
    && validPlanRemainder(input)
    && input.allNodeCallsFinanciallyConclusive === true
    && SHA256.test(input.terminalEvidenceDigest)
}

export function validPlanRemainder(input: PlanRelease): boolean {
  if (!validPlanHoldBooking(input) || canonicalFormanceUnits(input.holdBalanceUnits, false) === undefined
    || BigInt(input.holdBalanceUnits) > BigInt(input.approvedTotalUnits)
    || !validCredit(input, input.approvedTotalUnits)) return false
  const original = input.promotionalCreditAllocation
  const remaining = input.remainingCreditAllocation
  if (original === undefined) return remaining === undefined
  if (remaining === undefined || !validPromotionalCreditAllocation({
    buyerAmountUnits: input.holdBalanceUnits, promotionalCreditAllocation: remaining,
  }) || BigInt(remaining.purchasedUnits) > BigInt(original.purchasedUnits)) return false
  return remaining.grants.every(grant => {
    const source = original.grants.find(candidate => candidate.grantRef === grant.grantRef)
    return source !== undefined && source.expiresAt === grant.expiresAt && BigInt(grant.amountUnits) <= BigInt(source.amountUnits)
  })
}

function validPlanMoneyIdentity(input: Readonly<{
  planRef: string
  planDigest: string
  idempotencyKey: string
  accountRef: string
}>): boolean {
  return boundedReference(input.planRef)
    && SHA256.test(input.planDigest)
    && boundedReference(input.idempotencyKey)
    && boundedReference(input.accountRef)
}

function validPlanSpendingPeriods(
  principalRef: string,
  periods: FormanceManagedCallSpendingPeriods,
): boolean {
  return typeof periods === 'object'
    && periods !== null
    && periods.version === 'ae.spending-periods:v1'
    && validSpendingPeriod(principalRef, 'day', periods.daily)
    && validSpendingPeriod(principalRef, 'month', periods.monthly)
    && periods.daily.periodStartAt >= periods.monthly.periodStartAt
    && periods.daily.periodEndAt <= periods.monthly.periodEndAt
}

function planLegalExposureAccounts(legalCustomerRef: string, generation: number) {
  const digest = digestReference('legal_customer_exposure', {
    subjectRef: legalCustomerRef,
    generation,
  })
  return Object.freeze({
    available: `legal_customers:${digest}:exposure_available`,
    reserved: `legal_customers:${digest}:exposure_reserved`,
    settled: `legal_customers:${digest}:exposure_settled`,
  })
}

function planSpendingPeriodAccounts(
  principalRef: string,
  periods: FormanceManagedCallSpendingPeriods,
) {
  const daily = formanceSpendingPeriodAccount(principalRef, 'day', periods.daily.periodStartAt)
  const monthly = formanceSpendingPeriodAccount(principalRef, 'month', periods.monthly.periodStartAt)
  return Object.freeze({
    dailyAvailable: daily.available,
    dailyReserved: daily.reserved,
    dailySpent: daily.spent,
    monthlyAvailable: monthly.available,
    monthlyReserved: monthly.reserved,
    monthlySpent: monthly.spent,
  })
}

function planMoneyCommand(
  input: Readonly<{
    planRef: string
    planDigest: string
    idempotencyKey: string
    accountRef: string
  }>,
  stage: string,
  template: FormanceMoneyCommand['template'],
  variables: Readonly<Record<string, string>>,
  evidenceDigest: string,
  nodeId?: string,
  grantRef?: string,
): FormanceMoneyCommand {
  const identity = {
    planDigest: stripDigest(input.planDigest),
    planRef: input.planRef,
    stage,
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(grantRef === undefined ? {} : { grantRef }),
  }
  const idempotencyDigest = digestValue('plan-money-idempotency', {
    idempotencyKey: input.idempotencyKey,
    ...identity,
  })
  return Object.freeze({
    commandRef: formanceReference(identity, stage),
    idempotencyKey: idempotencyDigest,
    schemaVersion: PLAN_FORMANCE_SCHEMA_VERSION,
    template,
    variables: Object.freeze({ ...variables }),
    metadata: Object.freeze({
      account_digest: digestReference('account', input.accountRef),
      command_digest: digestValue('plan-money-command', {
        format: 'ae.formance-plan-money:v1',
        input,
        stage,
        template,
        evidenceDigest,
      }),
      commitment_digest: stripDigest(input.planDigest),
      external_evidence_digest: stripDigest(evidenceDigest),
      idempotency_digest: idempotencyDigest,
      operation_digest: digestReference('plan', input.planRef),
    }),
  })
}


function validCredit(input: PlanHoldBooking, totalUnits: string): boolean {
  return validPromotionalCreditAllocation({ buyerAmountUnits: totalUnits,
    ...(input.promotionalCreditAllocation === undefined ? {} : { promotionalCreditAllocation: input.promotionalCreditAllocation }),
  })
}

function planPromotionalCommands(
  input: PlanHoldBooking,
  stage: 'hold' | 'allocate' | 'settle' | 'release-node' | 'release-remainder',
  evidenceDigest: string,
  node?: Pick<PlanNodeAllocation, 'nodeId' | 'callRef'>,
): FormanceMoneyCommand[] {
  return (input.promotionalCreditAllocation?.grants ?? []).map(grant => {
    const available = promotionalGrantAccount(input.accountRef, grant.grantRef)
    const hold = planPromotionalHoldAccountAddress(input, grant.grantRef)
    const reserved = node === undefined ? hold : `calls:${digestReference('call', node.callRef)}:buyer_promo_reserved`
    const source = stage === 'hold' ? available : stage === 'allocate' || stage === 'release-remainder' ? hold : reserved
    const destination = stage === 'hold' ? hold : stage === 'allocate' ? reserved
      : stage === 'settle' ? 'platform:expense:marketing' : available
    return planMoneyCommand(input, `promo-${stage}`, stage === 'hold' || stage === 'allocate' ? 'CALL_PROMO_RESERVED'
      : stage === 'settle' ? 'CALL_PROMO_SETTLED' : 'CALL_PROMO_RELEASED',
    { source, destination, amount: `AUD/6 ${grant.amountUnits}` }, evidenceDigest, node?.nodeId, grant.grantRef)
  })
}
