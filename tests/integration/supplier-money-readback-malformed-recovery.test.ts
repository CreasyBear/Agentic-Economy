import { createSupplierMoneyOwner } from './supplier-money-readback-harness'
import { describe, expect, it } from 'vitest'
import { internal } from '../../convex/_generated/api'

describe('supplier money readback malformed recovery', () => {
  it('refuses malformed recovery debit-credit pairs instead of excluding them', async () => {
    const { backend, businessRef, providerAccountRef } =
      await createSupplierMoneyOwner('supplier-earnings-malformed-recovery')
    const transactionRef = `transaction:${businessRef}:malformed-recovery`
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
        transactionRef,
        kind: 'charge',
        idempotencyKey: transactionRef,
        inputDigest: 'sha256:malformed-recovery-input',
        principalId: `principal:${businessRef}`,
        currency: 'USD',
        amountUnits: '100',
        exponent: 2,
        state: 'applied',
        budgetState: 'settled',
        settledAt: 1,
        expectedAccountVersion: 0,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${transactionRef}:provider-forged`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '90',
        currency: 'USD',
        exponent: 2,
        transactionRef,
        idempotencyKey: transactionRef,
        businessId: businessRef,
        sourceDigest: 'sha256:malformed-recovery-source',
        evidenceRefs: ['evidence:malformed-recovery'],
        createdAt: 1,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${transactionRef}:provider-recovery`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: '10',
        currency: 'USD',
        exponent: 2,
        transactionRef,
        idempotencyKey: transactionRef,
        businessId: businessRef,
        sourceDigest: 'sha256:malformed-recovery-source',
        evidenceRefs: ['evidence:malformed-recovery'],
        createdAt: 1,
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
