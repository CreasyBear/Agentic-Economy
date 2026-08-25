import { createSupplierMoneyBackend } from './supplier-money-readback-harness'
import type { Id } from '../../convex/_generated/dataModel'
import { describe, expect, it } from 'vitest'
import { internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { accountRefForProvider } from '@/modules/money/public'

describe('supplier money readback paidOut', () => {
  it('counts reversed payout debits and exact reversal credits once', async () => {
    const backend = createSupplierMoneyBackend()
    const businessRef = 'business:projection-mixed'
    const providerAccountRef = accountRefForProvider(businessRef, 'USD')
    const reversalTransactionRef = canonicalDigest({
      format: 'money-payout-reversal-transaction:v1',
      reservationTransactionRef: 'payout:projection:reversed',
    })
    const reversalIdempotencyKey = canonicalDigest({
      format: 'money-payout-reversal-idempotency:v1',
      reservationTransactionRef: 'payout:projection:reversed',
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
        transactionRef: 'payout:projection:applied',
        kind: 'payout_accrual',
        idempotencyKey: 'payout:projection:applied',
        inputDigest: 'sha256:payout-projection-applied',
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '200',
        exponent: 2,
        state: 'applied',
        expectedAccountVersion: 0,
        externalRef: 'payout-ref:projection-applied',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: 'payout:projection:reversed',
        kind: 'payout_accrual',
        idempotencyKey: 'payout:projection:reversed',
        inputDigest: 'sha256:payout-projection-reversed',
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '300',
        exponent: 2,
        state: 'reversed',
        expectedAccountVersion: 1,
        externalRef: 'payout-ref:projection-reversed',
        createdAt: 2,
        updatedAt: 3,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: reversalTransactionRef,
        kind: 'payout_accrual',
        idempotencyKey: reversalIdempotencyKey,
        inputDigest: 'sha256:payout-projection-reversal',
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '300',
        exponent: 2,
        state: 'reversed',
        expectedAccountVersion: 2,
        externalRef: 'payout-ref:projection-reversed',
        reversalOf: 'payout:projection:reversed',
        createdAt: 3,
        updatedAt: 3,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: 'payout:projection:applied:reservation',
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: '200',
        currency: 'USD',
        exponent: 2,
        transactionRef: 'payout:projection:applied',
        idempotencyKey: 'payout:projection:applied',
        businessId: businessRef,
        sourceDigest: 'sha256:entry-projection-applied',
        evidenceRefs: ['evidence:projection-applied'],
        createdAt: 1,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: 'payout:projection:reversed:reservation',
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: '300',
        currency: 'USD',
        exponent: 2,
        transactionRef: 'payout:projection:reversed',
        idempotencyKey: 'payout:projection:reversed',
        businessId: businessRef,
        sourceDigest: 'sha256:entry-projection-reversed',
        evidenceRefs: ['evidence:projection-reversed'],
        createdAt: 2,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${reversalTransactionRef}:payout-reversal`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '300',
        currency: 'USD',
        exponent: 2,
        transactionRef: reversalTransactionRef,
        idempotencyKey: reversalIdempotencyKey,
        businessId: businessRef,
        sourceDigest: 'sha256:entry-projection-reversal',
        evidenceRefs: ['evidence:projection-reversal'],
        reversalOf: 'payout:projection:reversed',
        createdAt: 3,
      })
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      kind: 'ok',
      paidOut: { currency: 'USD', units: '200', exponent: 2 },
    })
    await backend.run(async (ctx) => {
      const reversal = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', reversalTransactionRef),
        )
        .unique()
      if (reversal === null) throw new Error('projection_reversal_missing')
      await ctx.db.delete(reversal._id)
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${reversalTransactionRef}:payout-reversal`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '300',
        currency: 'USD',
        exponent: 2,
        transactionRef: reversalTransactionRef,
        idempotencyKey: reversalIdempotencyKey,
        businessId: businessRef,
        sourceDigest: 'sha256:entry-projection-reversal',
        evidenceRefs: ['evidence:projection-reversal'],
        reversalOf: 'payout:projection:reversed',
        createdAt: 3,
      })
    })
    await backend.run(async (ctx) => {
      const reversal = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', reversalTransactionRef),
        )
        .unique()
      if (reversal === null) throw new Error('projection_reversal_missing')
      await ctx.db.patch(reversal._id, { amountUnits: '299' })
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await backend.run(async (ctx) => {
      const reversal = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', reversalTransactionRef),
        )
        .unique()
      if (reversal === null) throw new Error('projection_reversal_missing')
      await ctx.db.patch(reversal._id, { amountUnits: '300' })
    })
    await backend.run(async (ctx) => {
      const transaction = await ctx.db
        .query('moneyTransactions')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', reversalTransactionRef),
        )
        .unique()
      if (transaction === null) throw new Error('projection_reversal_missing')
      await ctx.db.patch(transaction._id, { amountUnits: '299' })
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await backend.run(async (ctx) => {
      const transaction = await ctx.db
        .query('moneyTransactions')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', reversalTransactionRef),
        )
        .unique()
      if (transaction === null) throw new Error('projection_reversal_missing')
      await ctx.db.patch(transaction._id, { amountUnits: '300' })
    })
    let duplicateOriginalId: Id<'moneyLedgerEntries'> | undefined
    await backend.run(async (ctx) => {
      duplicateOriginalId = await ctx.db.insert('moneyLedgerEntries', {
        entryRef: 'payout:projection:reversed:duplicate',
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: '300',
        currency: 'USD',
        exponent: 2,
        transactionRef: 'payout:projection:reversed',
        idempotencyKey: 'payout:projection:reversed',
        businessId: businessRef,
        sourceDigest: 'sha256:entry-projection-reversed-duplicate',
        evidenceRefs: ['evidence:projection-reversed'],
        createdAt: 2,
      })
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    if (duplicateOriginalId === undefined)
      throw new Error('duplicate_original_fixture_missing')
    const duplicateId = duplicateOriginalId
    await backend.run(async (ctx) => {
      await ctx.db.delete(duplicateId)
    })
    const appliedReversalRef = canonicalDigest({
      format: 'money-payout-reversal-transaction:v1',
      reservationTransactionRef: 'payout:projection:applied',
    })
    const appliedReversalIdempotencyKey = canonicalDigest({
      format: 'money-payout-reversal-idempotency:v1',
      reservationTransactionRef: 'payout:projection:applied',
    })
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyTransactions', {
        transactionRef: appliedReversalRef,
        kind: 'payout_accrual',
        idempotencyKey: appliedReversalIdempotencyKey,
        inputDigest: 'sha256:payout-projection-applied-reversal',
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '200',
        exponent: 2,
        state: 'reversed',
        expectedAccountVersion: 2,
        externalRef: 'payout-ref:projection-applied',
        reversalOf: 'payout:projection:applied',
        createdAt: 3,
        updatedAt: 3,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${appliedReversalRef}:payout-reversal`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '200',
        currency: 'USD',
        exponent: 2,
        transactionRef: appliedReversalRef,
        idempotencyKey: appliedReversalIdempotencyKey,
        businessId: businessRef,
        sourceDigest: 'sha256:entry-projection-applied-reversal',
        evidenceRefs: ['evidence:projection-applied'],
        reversalOf: 'payout:projection:applied',
        createdAt: 3,
      })
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await backend.run(async (ctx) => {
      const reversal = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', appliedReversalRef),
        )
        .unique()
      const transaction = await ctx.db
        .query('moneyTransactions')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', appliedReversalRef),
        )
        .unique()
      if (reversal === null || transaction === null)
        throw new Error('applied_reversal_missing')
      await ctx.db.delete(reversal._id)
      await ctx.db.delete(transaction._id)
    })
    await backend.run(async (ctx) => {
      const reversal = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', reversalTransactionRef),
        )
        .unique()
      if (reversal === null) throw new Error('projection_reversal_missing')
      await ctx.db.patch(reversal._id, {
        reversalOf: 'payout:projection:missing',
      })
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await backend.run(async (ctx) => {
      const reversal = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', reversalTransactionRef),
        )
        .unique()
      if (reversal === null) throw new Error('projection_reversal_missing')
      await ctx.db.patch(reversal._id, {
        reversalOf: 'payout:projection:reversed',
      })
    })
    await backend.run(async (ctx) => {
      const reversal = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', reversalTransactionRef),
        )
        .unique()
      if (reversal === null) throw new Error('projection_reversal_missing')
      await ctx.db.patch(reversal._id, { amountUnits: '400' })
    })
    await expect(
      backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })

  it('classifies every provider payout debit before paidOut', async () => {
    const runCase = async (
      state: 'missing' | 'non_payout' | 'pending' | 'outcome_unknown',
    ) => {
      const backend = createSupplierMoneyBackend()
      const businessRef = `business:projection-debit-${state}`
      const providerAccountRef = accountRefForProvider(businessRef, 'USD')
      const transactionRef = `payout:projection-debit:${state}`
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
        if (state !== 'missing') {
          await ctx.db.insert('moneyTransactions', {
            transactionRef,
            kind: state === 'non_payout' ? 'charge' : 'payout_accrual',
            idempotencyKey: `idempotency:${state}`,
            inputDigest: `sha256:input:${state}`,
            principalId: `business:${businessRef}`,
            currency: 'USD',
            amountUnits: '100',
            exponent: 2,
            state:
              state === 'non_payout'
                ? 'applied'
                : state === 'pending'
                  ? 'pending'
                  : 'outcome_unknown',
            expectedAccountVersion: 0,
            createdAt: 1,
            updatedAt: 1,
          })
        }
        await ctx.db.insert('moneyLedgerEntries', {
          entryRef: `entry:${state}`,
          accountRef: providerAccountRef,
          entryType: 'payout_accrual',
          direction: 'debit',
          amountUnits: '100',
          currency: 'USD',
          exponent: 2,
          transactionRef,
          idempotencyKey:
            state === 'missing'
              ? `idempotency:${state}`
              : `idempotency:${state}`,
          businessId: businessRef,
          sourceDigest: `sha256:source:${state}`,
          evidenceRefs: [`evidence:${state}`],
          createdAt: 1,
        })
      })
      const result = backend.query(internal.moneyLedger.readProviderEarnings, {
        businessId: businessRef,
        currency: 'USD',
      })
      if (state === 'missing' || state === 'non_payout') {
        await expect(result).resolves.toMatchObject({
          kind: 'refused',
          code: 'payout_reconciliation_required',
        })
      } else {
        await expect(result).resolves.toMatchObject({
          kind: 'ok',
          paidOut: { currency: 'USD', units: '0', exponent: 2 },
        })
      }
    }
    await runCase('missing')
    await runCase('non_payout')
    await runCase('pending')
    await runCase('outcome_unknown')
  })
})
