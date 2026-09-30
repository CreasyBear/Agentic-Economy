import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'
import {
  createFormanceContext, executeFormanceMoneyCommand, installPackage4FormanceSchema,
  readFormanceAccount,
} from '@/modules/money/formance'
import {
  adjustFormanceSpendingPeriod, bookFormanceFundingSettlement,
  prepareFormancePromotionalCreditExpiry, prepareFormancePromotionalCreditGrant,
  promotionalGrantAccount, releaseFormanceManagedCall, reserveFormanceManagedCall,
  settleFormanceManagedCall, syncFormanceCapacity,
  type FormanceManagedCallBooking, type FormancePromotionalCreditBooking,
} from '@/modules/money/formance-workflows'

const sha = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const runIf = process.env.AE_FORMANCE_INTEGRATION === 'true'
const accountRef = 'account:promo-proof'
const principalRef = 'principal:promo-proof'
const legalCustomerRef = 'legal:promo-proof'
const treasuryRef = 'custody:promo-proof'
const policyDigest = sha('promo-proof-policy')
const evidenceDigest = sha('promo-proof-evidence')
const grantRef = 'grant:promo-proof'
const periodAt = Date.UTC(2026, 8, 30)
const day = currentUtcDayBounds(periodAt)
const month = currentUtcMonthBounds(periodAt)
const spendingPeriods = {
  version: 'ae.spending-periods:v1' as const,
  daily: { ...day, revision: 1, limitUnits: '1000' },
  monthly: { ...month, revision: 1, limitUnits: '1000' },
}

async function setup(label: string, purchasedUnits: string, promoUnits: string) {
  const ledger = `ae-promo-${label}-${createHash('sha256').update(`${Date.now()}:${process.pid}:${Math.random()}`).digest('hex').slice(0, 12)}`
  const context = createFormanceContext({ environment: 'sandbox', ledger,
    gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069', requestTimeoutMs: 30_000 })
  expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
  const grant: FormancePromotionalCreditBooking = {
    grantRef, accountRef, amountUnits: promoUnits, expiresAt: periodAt + 86_400_000,
    commandDigest: sha(`grant:${label}`),
  }
  const issued = prepareFormancePromotionalCreditGrant(grant)
  if (issued.kind !== 'prepared') throw new Error(issued.code)
  expect(await executeFormanceMoneyCommand(context, issued.command)).toMatchObject({ kind: 'completed', replayed: false })
  expect(await executeFormanceMoneyCommand(context, issued.command)).toMatchObject({ kind: 'completed', replayed: true })
  if (purchasedUnits !== '0') {
    expect(await bookFormanceFundingSettlement(context, {
      commandRef: `funding:${label}`, idempotencyKey: `funding:${label}`,
      accountRef, processorRef: `processor:${label}`,
      principalUnits: purchasedUnits, serviceFeeUnits: '1', taxUnits: '1',
      totalUnits: (BigInt(purchasedUnits) + 2n).toString(), policyDigest,
      externalEvidenceDigest: evidenceDigest,
    })).toMatchObject({ kind: 'completed' })
  }
  for (const period of [
    { periodKind: 'day' as const, ...spendingPeriods.daily },
    { periodKind: 'month' as const, ...spendingPeriods.monthly },
  ]) {
    expect(await adjustFormanceSpendingPeriod(context, {
      principalRef, periodKind: period.periodKind, periodStartAt: period.periodStartAt,
      periodEndAt: period.periodEndAt, revision: 1, previousLimitUnits: '0',
      targetLimitUnits: period.limitUnits, authorityDigest: policyDigest,
    })).toMatchObject({ kind: 'completed' })
  }
  for (const capacity of [
    { kind: 'legal_customer_exposure' as const, subjectRef: legalCustomerRef },
    { kind: 'treasury_usdc' as const, subjectRef: treasuryRef },
  ]) {
    expect(await syncFormanceCapacity(context, {
      commandRef: `capacity:${label}:${capacity.kind}`, idempotencyKey: `capacity:${label}:${capacity.kind}`,
      ...capacity, generation: 1, targetUnits: '1000', policyDigest,
      externalEvidenceDigest: evidenceDigest,
    })).toMatchObject({ kind: 'completed' })
  }
  return { context, grant }
}

function booking(label: string, buyerAmountUnits: string, purchasedUnits: string, promoUnits: string): FormanceManagedCallBooking {
  const buyerTaxUnits = (BigInt(buyerAmountUnits) / 10n).toString()
  return {
    callRef: `call:${label}`, quoteRef: `quote:${label}`, idempotencyKey: `call-key:${label}`,
    accountRef, principalRef, agentBudgetGeneration: 1, legalCustomerRef,
    legalCustomerGeneration: 1, treasuryRef, treasuryGeneration: 1,
    toolRef: 'tool:promo-proof', providerRef: 'provider:promo-proof',
    authorityGeneration: 1, policyGeneration: 1, buyerAmountUnits,
    buyerRevenueUnits: (BigInt(buyerAmountUnits) - BigInt(buyerTaxUnits)).toString(),
    buyerTaxUnits, providerAmountUnits: '10', quoteDigest: sha(`quote:${label}`),
    inputDigest: sha(`input:${label}`), policyDigest, rateEvidenceDigest: sha('rate'),
    treasuryEvidenceDigest: sha('treasury'), x402RequirementDigest: sha('x402'),
    spendingPeriods,
    promotionalCreditAllocation: {
      version: 'ae.promotional-credit-allocation:v1', purchasedUnits,
      grants: [{ grantRef, amountUnits: promoUnits, expiresAt: periodAt + 86_400_000 }],
    },
  }
}

function accountSegment(kind: string, reference: string): string {
  return canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind, reference } }).slice(7)
}

async function units(context: ReturnType<typeof createFormanceContext>, address: string): Promise<string> {
  const read = await readFormanceAccount(context, address)
  if (read.kind === 'not_found') return '0'
  if (read.kind !== 'completed') throw new Error(`read:${read.kind}`)
  return read.volumes['AUD/6']?.balanceUnits ?? '0'
}

describe.runIf(runIf)('real Formance promotional credit', () => {
  it('keeps grant, mixed purchase, release and expiry on their original ledgers with replay safety', async () => {
    const { context, grant } = await setup('flow', '200', '100')
    const purchased = `accounts:${accountSegment('account', accountRef)}:available`
    const promo = promotionalGrantAccount(accountRef, grantRef)
    expect(await units(context, promo)).toBe('100')
    expect(await units(context, 'platform:expense:marketing')).toBe('0')
    const mixed = booking('mixed', '100', '40', '60')
    expect(await reserveFormanceManagedCall(context, mixed)).toMatchObject({ kind: 'completed', replayed: false })
    expect(await reserveFormanceManagedCall(context, mixed)).toMatchObject({ kind: 'completed', replayed: true })
    expect(await units(context, purchased)).toBe('160')
    expect(await units(context, promo)).toBe('40')
    expect(await settleFormanceManagedCall(context, { booking: mixed, externalEvidenceDigest: evidenceDigest }))
      .toMatchObject({ kind: 'completed', replayed: false })
    expect(await settleFormanceManagedCall(context, { booking: mixed, externalEvidenceDigest: evidenceDigest }))
      .toMatchObject({ kind: 'completed', replayed: true })
    // Funding's A$0.000001 service fee and tax were booked first.
    expect(await units(context, 'platform:revenue:sales')).toBe('37')
    expect(await units(context, 'platform:tax:gst')).toBe('5')
    expect(await units(context, 'platform:expense:marketing')).toBe('60')

    const allPromo = booking('all-promo', '30', '0', '30')
    expect(await reserveFormanceManagedCall(context, allPromo)).toMatchObject({ kind: 'completed' })
    expect(await units(context, promo)).toBe('10')
    const expiry1 = prepareFormancePromotionalCreditExpiry({ ...grant, amountUnits: '10', revision: 1 })
    if (expiry1.kind !== 'prepared') throw new Error(expiry1.code)
    expect(await executeFormanceMoneyCommand(context, expiry1.command)).toMatchObject({ kind: 'completed' })
    expect(await units(context, promo)).toBe('0')
    expect(await releaseFormanceManagedCall(context, {
      booking: allPromo, externalEvidenceDigest: evidenceDigest, submissionProvenAbsent: true,
    })).toMatchObject({ kind: 'completed', replayed: false })
    expect(await units(context, promo)).toBe('30')
    const expiry2 = prepareFormancePromotionalCreditExpiry({ ...grant, amountUnits: '30', revision: 2 })
    if (expiry2.kind !== 'prepared') throw new Error(expiry2.code)
    expect(await executeFormanceMoneyCommand(context, expiry2.command)).toMatchObject({ kind: 'completed' })
    expect(await executeFormanceMoneyCommand(context, expiry2.command)).toMatchObject({ kind: 'completed', replayed: true })
    expect(await units(context, promo)).toBe('0')
    expect(await units(context, purchased)).toBe('160')
    expect(await units(context, 'platform:expense:marketing')).toBe('60')
  })

  it('atomically admits only one competing reservation against the same grant', async () => {
    const { context } = await setup('contention', '0', '20')
    const bookings = [booking('race-one', '20', '0', '20'), booking('race-two', '20', '0', '20')]
    const results = await Promise.all(bookings.map(async value => await reserveFormanceManagedCall(context, value)))
    expect(results.filter(result => result.kind === 'completed')).toHaveLength(1)
    expect(results.filter(result => result.kind !== 'completed')).toHaveLength(1)
    expect(await units(context, promotionalGrantAccount(accountRef, grantRef))).toBe('0')
    expect(await units(context, 'platform:expense:marketing')).toBe('0')
  })
})
