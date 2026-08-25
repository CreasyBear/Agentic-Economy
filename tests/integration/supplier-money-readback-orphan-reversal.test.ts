import { createSupplierMoneyBackend } from './supplier-money-readback-harness'
import { describe, expect, it } from 'vitest'
import { internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { accountRefForProvider } from '@/modules/money/public'

describe('supplier money readback orphan reversal', () => {
  it('rejects payout reversal credits whose original is outside the target projection', async () => {
    const backend = createSupplierMoneyBackend()
    const businessRef = 'business:projection-orphan-original'
    const providerAccountRef = accountRefForProvider(businessRef, 'USD')
    const originalRef = 'payout:foreign-original'
    const reversalRef = canonicalDigest({
      format: 'money-payout-reversal-transaction:v1',
      reservationTransactionRef: originalRef,
    })
    const reversalIdempotencyKey = canonicalDigest({
      format: 'money-payout-reversal-idempotency:v1',
      reservationTransactionRef: originalRef,
    })
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '0',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 0,
        state: 'active',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: originalRef,
        kind: 'payout_accrual',
        idempotencyKey: `${originalRef}:key`,
        inputDigest: 'sha256:foreign-original',
        principalId: 'business:foreign',
        currency: 'USD',
        amountUnits: '100',
        exponent: 2,
        state: 'reversed',
        expectedAccountVersion: 0,
        externalRef: 'payout:foreign',
        createdAt: 1,
        updatedAt: 2,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: reversalRef,
        kind: 'payout_accrual',
        idempotencyKey: reversalIdempotencyKey,
        inputDigest: 'sha256:foreign-reversal',
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '100',
        exponent: 2,
        state: 'reversed',
        expectedAccountVersion: 1,
        externalRef: 'payout:foreign',
        reversalOf: originalRef,
        createdAt: 2,
        updatedAt: 2,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${reversalRef}:payout-reversal`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '100',
        currency: 'USD',
        exponent: 2,
        transactionRef: reversalRef,
        idempotencyKey: reversalIdempotencyKey,
        businessId: businessRef,
        sourceDigest: 'sha256:foreign-reversal-entry',
        evidenceRefs: ['evidence:foreign-reversal'],
        reversalOf: originalRef,
        createdAt: 2,
      })
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })
})
