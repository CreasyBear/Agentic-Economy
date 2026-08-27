import { describe, expect, it } from 'vitest'

import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  appendRefundReversal,
  authorizePaidCharge,
  calculateTopupBonusAmount,
  createLedgerState,
  OWNER_TRIAL_PROMO_GRANT,
  ownerTrialPromoInputDigest,
  ownerTrialPromoTransactionRef,
  resolveTopupBonusBps,
  TOPUP_BONUS_LADDER,
  topupBonusInputDigest,
  topupBonusTransactionRef,
  type BeginTransactionInput,
  type MoneyAccount,
} from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'

const ownerId = 'owner_promotions'
const principal = 'clerk_api_key:key-promo'

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

describe('topup bonus ladder math', () => {
  it('selects the highest qualifying tier and floors the bonus at the cent', () => {
    expect(resolveTopupBonusBps(amount('USD', '4999', 2))).toBeUndefined()
    expect(resolveTopupBonusBps(amount('USD', '5000', 2))).toBe(500)
    expect(resolveTopupBonusBps(amount('USD', '9999', 2))).toBe(500)
    expect(resolveTopupBonusBps(amount('USD', '10000', 2))).toBe(1000)
    expect(resolveTopupBonusBps(amount('USD', '19999', 2))).toBe(1000)
    expect(resolveTopupBonusBps(amount('USD', '20000', 2))).toBe(1500)
    // production max top-up still earns the top tier
    expect(resolveTopupBonusBps(amount('USD', '2500000', 2))).toBe(1500)
    // ladder stays defined over USD cents like the top-up config itself
    for (const tier of TOPUP_BONUS_LADDER) {
      expect(tier.minimumAmount.currency).toBe('USD')
      expect(tier.minimumAmount.exponent).toBe(2)
      expect(tier.bonusBps).toBeGreaterThan(0)
    }
  })

  it('computes ladder bonuses floor-to-cent', () => {
    expect(calculateTopupBonusAmount(amount('USD', '5000', 2))).toEqual(amount('USD', '250', 2))
    expect(calculateTopupBonusAmount(amount('USD', '10000', 2))).toEqual(amount('USD', '1000', 2))
    expect(calculateTopupBonusAmount(amount('USD', '20000', 2))).toEqual(amount('USD', '3000', 2))
    // $149.99 earns 10% => $14.999 floored to $14.99
    expect(calculateTopupBonusAmount(amount('USD', '14999', 2))).toEqual(amount('USD', '1499', 2))
    // below the lowest tier there is no bonus row to post
    expect(calculateTopupBonusAmount(amount('USD', '1024', 2))).toBeUndefined()
  })

  it('skips promotions outside USD, matching the USD-only top-up config', () => {
    expect(resolveTopupBonusBps(amount('EUR', '20000', 2))).toBeUndefined()
    expect(calculateTopupBonusAmount(amount('EUR', '20000', 2))).toBeUndefined()
    expect(OWNER_TRIAL_PROMO_GRANT).toEqual({ currency: 'USD', units: '100', exponent: 2 })
  })

  it('derives deterministic exactly-once references from stable material', () => {
    const accountRefA = accountRefForOwner('owner-a', 'USD')
    const accountRefB = accountRefForOwner('owner-b', 'USD')
    expect(ownerTrialPromoTransactionRef(accountRefA)).toBe(
      ownerTrialPromoTransactionRef(accountRefA),
    )
    expect(ownerTrialPromoTransactionRef(accountRefA)).not.toBe(
      ownerTrialPromoTransactionRef(accountRefB),
    )
    expect(topupBonusTransactionRef('tx-1')).toBe(topupBonusTransactionRef('tx-1'))
    expect(topupBonusTransactionRef('tx-1')).not.toBe(topupBonusTransactionRef('tx-2'))
    expect(ownerTrialPromoInputDigest(accountRefA)).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(
      topupBonusInputDigest({
        ownerAccountRef: accountRefA,
        topupTransactionRef: 'tx-1',
        topupAmountUnits: '5000',
      }),
    ).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})

describe('promotion credit spendability on the fungible operator wallet (Option B)', () => {
  const promoWallet: MoneyAccount = {
    accountRef: accountRefForOwner(ownerId, 'USD'),
    accountKind: 'operator_credit',
    accountId: ownerId,
    balance: amount('USD', '5350', 2),
    recoveryDue: amount('USD', '0', 2),
    version: 3,
    state: 'active',
    createdAt: 1,
    updatedAt: 1,
  }
  const providerAccount: MoneyAccount = {
    accountRef: accountRefForProvider('business-promo', 'USD'),
    accountKind: 'provider_earnings',
    businessId: 'business-promo',
    balance: amount('USD', '0', 2),
    recoveryDue: amount('USD', '0', 2),
    version: 0,
    state: 'active',
    createdAt: 1,
    updatedAt: 1,
  }
  const rakeAccount: MoneyAccount = {
    accountRef: accountRefForRake('USD'),
    accountKind: 'ae_rake',
    balance: amount('USD', '0', 2),
    recoveryDue: amount('USD', '0', 2),
    version: 0,
    state: 'active',
    createdAt: 1,
    updatedAt: 1,
  }

  function transaction(overrides: Partial<BeginTransactionInput> = {}): BeginTransactionInput {
    // refund contracts pin the original charge idempotencyKey to its transactionRef
    return {
      transactionRef: 'charge-1',
      kind: 'charge',
      idempotencyKey: 'charge-1',
      inputDigest: 'input-1',
      principalId: principal,
      accountId: ownerId,
      currency: 'USD',
      expectedAccountVersion: 3,
      now: 10,
      ...overrides,
    }
  }

  function chargeInput(overrides: Partial<Parameters<typeof authorizePaidCharge>[0]> = {}) {
    return {
      state: createLedgerState([promoWallet, providerAccount, rakeAccount]),
      transaction: transaction(),
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef: accountRefForProvider('business-promo', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '5350', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'price-promo',
      principalId: principal,
      accountId: ownerId,
      credentialId: 'key-promo',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-promo',
      invocationRef: 'inv-1',
      attemptRef: 'attempt-1',
      operationKey: 'operation-1',
      sourceDigest: 'source-promo',
      evidenceRefs: ['invocation:promo'],
      observedAt: 11,
      ...overrides,
    }
  }

  it('spends purchased and promotion funds fungibly down to zero', () => {
    const spent = authorizePaidCharge(chargeInput())
    expect(spent.result).toMatchObject({ kind: 'accepted', chargeState: 'paid' })
    expect(spent.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(
      amount('USD', '0', 2),
    )
  })

  it('refuses spend beyond the combined balance without partial consumption', () => {
    const refused = authorizePaidCharge(chargeInput({ grossAmount: amount('USD', '5351', 2) }))
    expect(refused.result).toMatchObject({
      kind: 'refused',
      code: 'insufficient_credit',
      availableAmount: amount('USD', '5350', 2),
    })
    expect(refused.state.transactions).toHaveLength(0)
    expect(refused.state.entries).toHaveLength(0)
  })

  it('refunds in kind: restores exactly the charged amount and never mints promotion kinds', () => {
    const charged = authorizePaidCharge(chargeInput())
    if (charged.result.kind !== 'accepted') throw new Error('expected paid charge')
    const refunded = appendRefundReversal({
      state: charged.state,
      transaction: {
        ...transaction({
          transactionRef: 'refund-1',
          kind: 'refund',
          idempotencyKey: 'refund-key',
          inputDigest: 'refund-input',
          expectedAccountVersion: 4,
        }),
        reversalOf: 'charge-1',
      },
      originalTransactionRef: 'charge-1',
      principalId: principal,
      sourceDigest: 'refund-source',
      evidenceRefs: ['refund:evidence'],
      observedAt: 20,
    })
    expect(refunded.result).toMatchObject({ kind: 'accepted' })
    const refundEntries = refunded.state.entries.filter((entry) => entry.reversalOf === 'charge-1')
    expect(refundEntries.map((entry) => entry.entryType)).toEqual([
      'refund',
      'refund',
      'refund',
    ])
    // refund-in-kind policy: reversal credits exactly what the charge debited
    // and creates no promo_grant/topup_bonus/topup replacement rows.
    const mintedPromotionKinds = refunded.state.entries.filter(
      (entry) =>
        entry.reversalOf === undefined &&
        (entry.entryType === 'promo_grant' || entry.entryType === 'topup_bonus' || entry.entryType === 'topup'),
    )
    expect(mintedPromotionKinds).toHaveLength(0)
    expect(refunded.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(
      amount('USD', '5350', 2),
    )
  })

  it('keeps free-tier usage semantics untouched by credit-only postings', () => {
    // Charging a zero-dollar operation remains free_tier with no usage cost
    // even when the wallet holds promotion funds.
    const free = authorizePaidCharge(chargeInput({ grossAmount: amount('USD', '0', 2), freeTier: true }))
    expect(free.result).toMatchObject({ kind: 'accepted', chargeState: 'free_tier' })
    expect(free.state.usageEvents[0]?.amount).toEqual(amount('USD', '0', 2))
    expect(free.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(
      amount('USD', '5350', 2),
    )
  })
})
