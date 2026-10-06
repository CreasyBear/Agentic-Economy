import { describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'
import {
  createFormanceContext, installPackage4FormanceSchema, readFormanceAccount,
  readFormanceAccountHistory, readFormancePeriodSpend, readFormanceStatementPage,
} from '@/modules/money/formance'
import {
  adjustFormanceSpendingPeriod, bookFormanceFundingSettlement, formanceSpendingPeriodAccount,
  grantFormancePromotionalCredit, managedCallAccounts, planHoldAccountAddress, planPromotionalHoldAccountAddress,
  promotionalGrantAccount, readFormanceManagedCallRelease, readFormanceManagedCallReservation,
  readFormanceManagedCallSettlement, readPlanHoldRemainder, refundFormanceSettledSale,
  releaseFormanceManagedCall, releasePlanRemainder, reserveFormanceManagedCall,
  reservePlanHold, settleFormanceManagedCall, syncFormanceCapacity,
  type FormanceManagedCallBooking, type PlanHoldBooking,
} from '@/modules/money/formance-workflows'

const runIf = process.env.AE_FORMANCE_INTEGRATION === 'true'
const digest = canonicalDigest({ proof: 'plans' })
const accountRef = 'account:plan-proof'
const principalRef = 'principal:plan-proof'
const legalCustomerRef = 'legal:plan-proof'
const treasuryRef = 'custody:plan-proof'
const grantRef = 'grant:plan-proof'
const expiresAt = Date.UTC(2027, 0, 1)
// Deliberately older than execution: node finalization must use the held periods.
const periodAt = Date.UTC(2026, 8, 30)
const spendingPeriods = {
  version: 'ae.spending-periods:v1' as const,
  daily: { ...currentUtcDayBounds(periodAt), revision: 1, limitUnits: '1000' },
  monthly: { ...currentUtcMonthBounds(periodAt), revision: 1, limitUnits: '1000' },
}

function credit(total: number, purchased: number) {
  return { version: 'ae.promotional-credit-allocation:v1' as const, purchasedUnits: String(purchased),
    grants: total === purchased ? [] : [{ grantRef, amountUnits: String(total - purchased), expiresAt }],
  }
}

function hold(purchased: number, total = 200): PlanHoldBooking {
  return { planRef: 'plan:one', planDigest: digest, idempotencyKey: 'plan-key:one',
    accountRef, principalRef, legalCustomerRef, legalCustomerGeneration: 1,
    approvedTotalUnits: String(total), spendingPeriods, promotionalCreditAllocation: credit(total, purchased),
  }
}

function node(purchased: number, id = 'one'): FormanceManagedCallBooking {
  return {
    callRef: `call:${id}`, quoteRef: `quote:${id}`, idempotencyKey: `call-key:${id}`,
    accountRef, principalRef, legalCustomerRef, legalCustomerGeneration: 1,
    agentBudgetGeneration: 1, treasuryRef, treasuryGeneration: 1, toolRef: 'tool:proof',
    providerRef: 'provider:proof', authorityGeneration: 1, policyGeneration: 1,
    buyerAmountUnits: '100', buyerRevenueUnits: '90', buyerTaxUnits: '10', providerAmountUnits: '10',
    quoteDigest: digest, inputDigest: digest, policyDigest: digest, rateEvidenceDigest: digest,
    treasuryEvidenceDigest: digest, x402RequirementDigest: digest, spendingPeriods,
    promotionalCreditAllocation: credit(100, purchased),
    planAllocation: { planRef: 'plan:one', planDigest: digest, approvedTotalUnits: '200', nodeId: id, nodeCeilingUnits: '100' },
  }
}

async function setup() {
  const context = createFormanceContext({ environment: 'sandbox',
    gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069',
    ledger: `ae-plans-${crypto.randomUUID().slice(0, 16)}`, requestTimeoutMs: 30_000,
  })
  expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
  expect(await bookFormanceFundingSettlement(context, {
    commandRef: 'funding:one', idempotencyKey: 'funding:one', accountRef, processorRef: 'processor:one',
    principalUnits: '1000', serviceFeeUnits: '1', taxUnits: '1', totalUnits: '1002',
    policyDigest: digest, externalEvidenceDigest: digest,
  })).toMatchObject({ kind: 'completed' })
  expect(await grantFormancePromotionalCredit(context, {
    grantRef, accountRef, amountUnits: '1000', expiresAt, commandDigest: digest,
  })).toMatchObject({ kind: 'completed' })
  for (const period of [
    { periodKind: 'day' as const, ...spendingPeriods.daily },
    { periodKind: 'month' as const, ...spendingPeriods.monthly },
  ]) expect(await adjustFormanceSpendingPeriod(context, {
    principalRef, periodKind: period.periodKind, periodStartAt: period.periodStartAt,
    periodEndAt: period.periodEndAt, revision: 1, previousLimitUnits: '0', targetLimitUnits: '1000', authorityDigest: digest,
  })).toMatchObject({ kind: 'completed' })
  for (const capacity of [
    { kind: 'legal_customer_exposure' as const, subjectRef: legalCustomerRef },
    { kind: 'treasury_usdc' as const, subjectRef: treasuryRef },
  ]) expect(await syncFormanceCapacity(context, {
    commandRef: `capacity:${capacity.kind}`, idempotencyKey: `capacity:${capacity.kind}`, ...capacity,
    generation: 1, targetUnits: '1000', policyDigest: digest, externalEvidenceDigest: digest,
  })).toMatchObject({ kind: 'completed' })
  return context
}

async function units(context: Awaited<ReturnType<typeof setup>>, address: string, asset = 'AUD/6') {
  const value = await readFormanceAccount(context, address)
  if (value.kind === 'not_found') return '0'
  if (value.kind !== 'completed') throw new Error(`balance:${value.kind}`)
  return value.volumes[asset]?.balanceUnits ?? '0'
}

const accountDigest = canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind: 'account', reference: accountRef } }).slice(7)
const day = formanceSpendingPeriodAccount(principalRef, 'day', spendingPeriods.daily.periodStartAt)

describe.runIf(runIf)('native Plan funding and Call consequences', () => {
  it.each([0, 40, 100])('settles purchased=%i, preserves promotional identity, and replays a lost remainder response', async (purchased) => {
    const context = await setup()
    const plan = hold(purchased * 2)
    const booking = node(purchased)
    const accounts = managedCallAccounts(booking)
    if (accounts === undefined) throw new Error('invalid fixture')
    expect(await reservePlanHold(context, plan)).toMatchObject({ kind: 'completed', replayed: false })
    expect(await reservePlanHold(context, plan)).toMatchObject({ kind: 'completed', replayed: true })
    expect(await units(context, day.available)).toBe('800')
    expect(await reserveFormanceManagedCall(context, booking)).toMatchObject({ kind: 'completed', replayed: false })
    expect(await reserveFormanceManagedCall(context, booking)).toMatchObject({ kind: 'completed', replayed: true })
    expect(await readFormanceManagedCallReservation(context, booking)).toMatchObject({ kind: 'confirmed' })
    expect(await units(context, day.available)).toBe('800')
    expect(await units(context, planHoldAccountAddress(plan))).toBe(String(purchased))
    expect(await units(context, planPromotionalHoldAccountAddress(plan, grantRef))).toBe(String(100 - purchased))

    expect(await settleFormanceManagedCall(context, { booking, externalEvidenceDigest: digest })).toMatchObject({ kind: 'completed' })
    const settlement = await readFormanceManagedCallSettlement(context, booking)
    expect(settlement).toMatchObject({ kind: 'confirmed' })
    expect(await units(context, day.spent)).toBe('100')
    expect(await units(context, day.reserved)).toBe('100')
    expect(await units(context, 'platform:revenue:sales')).toBe(String(1 + purchased * 9 / 10))
    expect(await units(context, 'platform:tax:gst')).toBe(String(1 + purchased / 10))
    expect(await units(context, 'platform:expense:marketing')).toBe(String(100 - purchased))
    expect(await units(context, accounts.providerSettlement, 'USDC/6')).toBe('10')

    const remainder = await readPlanHoldRemainder(context, plan)
    if (remainder.kind !== 'available') throw new Error(`remainder:${remainder.kind}`)
    expect(remainder.holdBalanceUnits).toBe('100')
    const release = { ...plan, ...remainder, allNodeCallsFinanciallyConclusive: true as const, terminalEvidenceDigest: digest }
    const createBulk = context.sdk.ledger.v2.createBulk.bind(context.sdk.ledger.v2)
    const dropped = vi.spyOn(context.sdk.ledger.v2, 'createBulk').mockImplementationOnce(async (...args) => {
      await createBulk(...args)
      throw new Error('response_lost_after_native_commit')
    })
    expect(await releasePlanRemainder(context, release)).toMatchObject({ kind: 'completed', replayed: true })
    dropped.mockRestore()
    expect(await releasePlanRemainder(context, release)).toMatchObject({ kind: 'completed', replayed: true })
    expect(await units(context, planHoldAccountAddress(plan))).toBe('0')
    expect(await units(context, planPromotionalHoldAccountAddress(plan, grantRef))).toBe('0')
    expect(await units(context, day.available)).toBe('900')
    expect(await units(context, day.reserved)).toBe('0')
    expect(await units(context, accounts.accountAvailable)).toBe(String(1000 - purchased))
    expect(await units(context, promotionalGrantAccount(accountRef, grantRef))).toBe(String(900 + purchased))

    const period = { accountDigest, ...currentUtcMonthBounds(Date.now()) }
    expect(await readFormancePeriodSpend(context, period)).toMatchObject({ kind: 'available', spendUnits: '100', transactionCountUnits: '1' })
    expect(await readFormanceStatementPage(context, { ...period, periodEndAt: Date.now(), snapshotCutoffAt: Date.now() })).toMatchObject({
      kind: 'available', exactAmountUnits: String(purchased),
    })
    const history = await readFormanceAccountHistory(context, { accountDigest, cursorKey: 'plan-proof-history-key'.repeat(2), now: Date.now() })
    expect(history).toMatchObject({ kind: 'available', coverage: 'complete' })
    if (history.kind === 'available') expect(history.entries.filter(entry => entry.kind === 'unmapped')).toEqual([])

    if (settlement.kind !== 'confirmed') throw new Error('settlement evidence missing')
    expect(await refundFormanceSettledSale(context, {
      booking, originalSettlementRefs: settlement.transactionRefs, reportDigest: digest,
    })).toMatchObject({ kind: 'completed' })
    expect(await units(context, accounts.accountAvailable)).toBe('1000')
    expect(await units(context, promotionalGrantAccount(accountRef, grantRef))).toBe('1000')
    expect(await units(context, accounts.providerSettlement, 'USDC/6')).toBe('10')
    expect(await units(context, day.available)).toBe('1000')
  })

  it('releases a conclusively unpaid node to its original grant and periods, with zero Plan remainder', async () => {
    const context = await setup()
    const plan = hold(0)
    expect(await reservePlanHold(context, plan)).toMatchObject({ kind: 'completed' })
    for (const id of ['one', 'two']) {
      const booking = node(0, id)
      expect(await reserveFormanceManagedCall(context, booking)).toMatchObject({ kind: 'completed' })
      expect(await releaseFormanceManagedCall(context, { booking, externalEvidenceDigest: digest, submissionProvenAbsent: true })).toMatchObject({ kind: 'completed' })
      expect(await readFormanceManagedCallRelease(context, booking)).toMatchObject({ kind: 'confirmed' })
    }
    const remainder = await readPlanHoldRemainder(context, plan)
    if (remainder.kind !== 'available') throw new Error('remainder missing')
    expect(remainder.holdBalanceUnits).toBe('0')
    expect(await releasePlanRemainder(context, { ...plan, ...remainder,
      allNodeCallsFinanciallyConclusive: true, terminalEvidenceDigest: digest,
    })).toMatchObject({ kind: 'completed', transactionRefs: [] })
    expect(await units(context, promotionalGrantAccount(accountRef, grantRef))).toBe('1000')
    expect(await units(context, day.available)).toBe('1000')
    expect(await units(context, day.reserved)).toBe('0')
  })

  it('atomically admits only one competing Hold beyond shared capacity', async () => {
    const context = await setup()
    const plans = ['one', 'two'].map(id => ({ ...hold(350, 700), planRef: `plan:${id}`, idempotencyKey: `plan-key:${id}` }))
    const outcomes = await Promise.all(plans.map(plan => reservePlanHold(context, plan)))
    expect(outcomes.filter(outcome => outcome.kind === 'completed')).toHaveLength(1)
    expect(await units(context, day.available)).toBe('300')
    expect(await units(context, day.reserved)).toBe('700')
    expect(await units(context, promotionalGrantAccount(accountRef, grantRef))).toBe('650')
    const winner = plans[outcomes.findIndex(outcome => outcome.kind === 'completed')]
    if (winner === undefined) throw new Error('winner missing')
    expect(await reservePlanHold(context, { ...winner, promotionalCreditAllocation: credit(700, 300) })).toMatchObject({ kind: 'refused' })
    expect(await units(context, day.reserved)).toBe('700')
  })

  it('refuses fabricated zero Holds and a remainder that changed after its native read', async () => {
    const context = await setup()
    const plan = hold(80)
    expect(await releasePlanRemainder(context, { ...plan, holdBalanceUnits: '0', remainingCreditAllocation: credit(0, 0),
      allNodeCallsFinanciallyConclusive: true, terminalEvidenceDigest: digest,
    })).toMatchObject({ kind: 'refused', code: 'formance_plan_hold_evidence_missing' })
    expect(await reservePlanHold(context, plan)).toMatchObject({ kind: 'completed' })
    const stale = await readPlanHoldRemainder(context, plan)
    if (stale.kind !== 'available') throw new Error('remainder missing')
    expect(await reserveFormanceManagedCall(context, node(40))).toMatchObject({ kind: 'completed' })
    expect(await releasePlanRemainder(context, { ...plan, ...stale,
      allNodeCallsFinanciallyConclusive: true, terminalEvidenceDigest: digest,
    })).toMatchObject({ kind: 'refused', code: 'formance_plan_remainder_changed' })
    expect(await units(context, day.reserved)).toBe('200')
  })
})
