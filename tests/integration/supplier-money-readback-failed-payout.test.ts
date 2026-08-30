import {
  beginPayoutTransfer,
  createSupplierMoneyOwner,
  readOwnerPayoutTransfer,
  reconcilePayoutTransfer,
} from './supplier-money-readback-harness'
import type { Id } from '../../convex/_generated/dataModel'
import { describe, expect, it } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { STRIPE_TRANSFER_RECOVERY_WINDOW_MS } from '@/modules/money/public'
import { withSourceWrite } from '../helpers/source-write-admission'

describe('supplier money readback failed payout', () => {
  it('reads failed payout amount from its immutable reservation and refuses inconsistent journals', async () => {
    const {
      backend,
      owner,
      businessRef,
      principalId,
      accountRef,
      providerAccountRef,
    } =
      await createSupplierMoneyOwner(
        'supplier-earnings-reservation-readback',
      )
    const periodStart = '2026-07-01T00:00:00.000Z'
    const periodEnd = '2026-07-02T00:00:00.000Z'
    const payoutRef = canonicalDigest({
      format: 'money-daily-payout:v1',
      businessId: businessRef,
      currency: 'USD',
      periodStart,
      periodEnd,
    } as const)
    const payoutCommandId = `command:${businessRef}:readback`
    const inputDigest = 'sha256:readback-input'
    const requestDigest = 'sha256:readback-request'
    const idempotencyKey = `idempotency:${businessRef}:readback`
    const amount = { currency: 'USD', units: '500', exponent: 2 } as const
    const observedAt = Date.parse(periodEnd) + 1
    const providerRecoveryDeadlineAt =
      observedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS
    const qualifiedUseRef = `qualified-use:${businessRef}:readback`
    const materialDigest = 'sha256:readback-material'
    const allocationRef = canonicalDigest({
      format: 'money-qualified-use-allocation:v1',
      qualifiedUseRef,
      materialDigest,
    } as const)
    const authorityGrantRef = `grt_${'a'.repeat(32)}`
    const authorityGrantGeneration = 1
    const authorityResourceRef = `operation:${businessRef}`
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '500',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 1,
        state: 'active',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('moneyPayoutAccounts', {
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        stripeAccountId: 'acct_destination',
        state: 'ready',
        detailsSubmitted: true,
        recipientCapabilityActive: true,
        requirementsDigest: 'sha256:requirements',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('moneyPayouts', {
        payoutRef,
        businessId: businessRef,
        owningAccountRef: accountRef,
        authorityPrincipalRef: principalId,
        authorityGrantRef,
        authorityGrantGeneration,
        authorityResourceRefs: [authorityResourceRef],
        currency: 'USD',
        exponent: 2,
        grossAccrualUnits: '550',
        rakeUnits: '50',
        providerNetUnits: '500',
        minimumPayoutUnits: '0',
        cadence: 'daily',
        state: 'held_threshold',
        periodStart,
        periodEnd,
        providerAccountRef,
        idempotencyKey: 'payout-before-readback',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('moneyPayoutAllocations', {
        allocationRef,
        payoutRef,
        qualifiedUseRef,
        materialDigest,
        transactionRef: `allocation:${businessRef}:readback`,
        usageRef: `usage:${businessRef}:readback`,
        businessId: businessRef,
        owningAccountRef: accountRef,
        authorityPrincipalRef: principalId,
        authorityGrantRef,
        authorityGrantGeneration,
        authorityResourceRef,
        currency: 'USD',
        exponent: 2,
        grossAccrualUnits: '550',
        rakeUnits: '50',
        providerNetUnits: '500',
        qualifiedAt: Date.parse(periodStart) + 1,
        sourceDigest: 'sha256:readback-allocation',
        createdAt: 1,
      })
    })
    const hostileBeginArgs = await withSourceWrite('billing', {
      authority: { principalId: `principal:${businessRef}` },
      businessId: businessRef,
      amount,
      providerAccountRef,
      destinationAccountId: 'acct_destination',
      payoutRef,
      commandId: payoutCommandId,
      inputDigest,
      requestDigest,
      idempotencyKey,
      providerRecoveryDeadlineAt,
      observedAt,
      operationKey: `money:readback:begin:${businessRef}`,
      correlationId: `money:readback:begin:${businessRef}`,
    })
    const beforeHostileBegin = await backend.run(async (ctx) => ({
      account: await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique(),
      transactions: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', payoutRef))
        .take(4),
    }))
    await expect(
      owner.mutation(beginPayoutTransfer, hostileBeginArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
      retryable: false,
    })
    const afterHostileBegin = await backend.run(async (ctx) => ({
      account: await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique(),
      transactions: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', payoutRef))
        .take(4),
    }))
    expect(afterHostileBegin).toEqual(beforeHostileBegin)
    const beginArgs = await withSourceWrite('billing', {
      ...hostileBeginArgs,
      authority: { principalId },
    })
    await expect(
      owner.mutation(beginPayoutTransfer, beginArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    const evidenceDigest = 'sha256:readback-not-released'
    const notReleasedEvidence = {
      provider: 'stripe' as const,
      resolution: 'not_released' as const,
      destinationAccountId: 'acct_destination',
      amount,
      status: 'failed' as const,
      requestDigest,
      evidenceDigest,
      observedAt: observedAt + 1,
    }
    const reconcileArgs = await withSourceWrite('billing', {
      authority: { principalId },
      businessId: businessRef,
      amount,
      providerAccountRef,
      destinationAccountId: 'acct_destination',
      payoutRef,
      commandId: payoutCommandId,
      inputDigest,
      idempotencyKey,
      evidence: notReleasedEvidence,
      sourceDigest: canonicalDigest({
        format: 'money-payout-evidence:v1',
        evidence: evidenceDigest,
      } as const),
      evidenceRefs: [evidenceDigest],
      failureCode: 'payout_not_released',
      outcome: 'not_released' as const,
      observedAt: observedAt + 2,
      operationKey: `money:readback:reconcile:${businessRef}`,
      correlationId: `money:readback:reconcile:${businessRef}`,
    })
    await expect(
      owner.mutation(reconcilePayoutTransfer, reconcileArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', transferStatus: 'failed' },
    })
    await backend.run(async (ctx) => {
      const payout = await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique()
      if (payout === null) throw new Error('readback_payout_missing')
      await ctx.db.patch(payout._id, { providerNetUnits: '450' })
    })
    const readbackArgs = {
      businessId: businessRef,
      currency: 'USD',
      payoutRef,
      idempotencyKey,
    }
    await expect(
      owner.query(readOwnerPayoutTransfer, readbackArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        payoutRef,
        state: 'held_threshold',
        transferStatus: 'failed',
        amount,
        evidenceDigest,
      },
    })
    await backend.run(async (ctx) => {
      const payout = await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique()
      if (payout === null) throw new Error('missing_failure_evidence_payout')
      await ctx.db.patch(payout._id, { transferEvidenceDigest: undefined })
    })
    const beforeMissingFailureEvidence = await backend.run(async (ctx) => ({
      payout: await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique(),
      transactions: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', payoutRef))
        .take(4),
      entries: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_accountRef_and_createdAt', (q) =>
          q.eq('accountRef', providerAccountRef),
        )
        .order('asc')
        .take(10),
    }))
    await expect(
      owner.query(readOwnerPayoutTransfer, readbackArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_reconciliation_required',
      retryable: false,
    })
    const afterMissingFailureEvidence = await backend.run(async (ctx) => ({
      payout: await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique(),
      transactions: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', payoutRef))
        .take(4),
      entries: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_accountRef_and_createdAt', (q) =>
          q.eq('accountRef', providerAccountRef),
        )
        .order('asc')
        .take(10),
    }))
    expect(afterMissingFailureEvidence).toEqual(beforeMissingFailureEvidence)
    await backend.run(async (ctx) => {
      const payout = await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique()
      if (payout === null) throw new Error('missing_failure_evidence_payout')
      await ctx.db.patch(payout._id, {
        transferEvidenceDigest: evidenceDigest,
      })
    })
    const beforeReplay = await backend.run(async (ctx) => ({
      account: await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique(),
      payout: await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique(),
      transactions: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', payoutRef))
        .take(4),
      entries: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_accountRef_and_createdAt', (q) =>
          q.eq('accountRef', providerAccountRef),
        )
        .order('asc')
        .take(10),
    }))
    const replayReconcileArgs = await withSourceWrite('billing', {
      ...reconcileArgs,
    })
    await expect(
      owner.mutation(reconcilePayoutTransfer, replayReconcileArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'held_threshold',
        transferStatus: 'failed',
        amount,
        evidenceDigest,
      },
    })
    const afterReplay = await backend.run(async (ctx) => ({
      account: await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique(),
      payout: await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique(),
      transactions: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', payoutRef))
        .take(4),
      entries: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_accountRef_and_createdAt', (q) =>
          q.eq('accountRef', providerAccountRef),
        )
        .order('asc')
        .take(10),
    }))
    expect(afterReplay).toEqual(beforeReplay)
    const differentBeginArgs = await withSourceWrite('billing', {
      ...beginArgs,
      commandId: `${payoutCommandId}:different`,
      inputDigest: 'sha256:readback-input-different',
      requestDigest: 'sha256:readback-request-different',
      idempotencyKey: `${idempotencyKey}:different`,
      operationKey: `money:readback:begin:different:${businessRef}`,
      correlationId: `money:readback:begin:different:${businessRef}`,
    })
    const beforeDifferent = await backend.run(async (ctx) => ({
      account: await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique(),
      payout: await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique(),
      transactions: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', payoutRef))
        .take(4),
      entries: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_accountRef_and_createdAt', (q) =>
          q.eq('accountRef', providerAccountRef),
        )
        .order('asc')
        .take(10),
    }))
    await expect(
      owner.mutation(beginPayoutTransfer, differentBeginArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    const afterDifferent = await backend.run(async (ctx) => ({
      account: await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique(),
      payout: await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique(),
      transactions: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', payoutRef))
        .take(4),
      entries: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_accountRef_and_createdAt', (q) =>
          q.eq('accountRef', providerAccountRef),
        )
        .order('asc')
        .take(10),
    }))
    expect(afterDifferent).toEqual(beforeDifferent)
    const reservationRef = canonicalDigest({
      format: 'money-payout-reservation-transaction:v1',
      payoutRef,
      payoutCommandId,
      inputDigest,
      idempotencyKey,
    } as const)
    const journal = await backend.run(async (ctx) => ({
      reservation: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', reservationRef))
        .unique(),
      reversal: await ctx.db
        .query('moneyTransactions')
        .withIndex('by_reversalOf', (q) => q.eq('reversalOf', reservationRef))
        .unique(),
      credit: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq(
            'transactionRef',
            canonicalDigest({
              format: 'money-payout-reversal-transaction:v1',
              reservationTransactionRef: reservationRef,
            } as const),
          ),
        )
        .unique(),
    }))
    if (journal.reservation === null || journal.reversal === null || journal.credit === null)
      throw new Error('readback_reversal_fixture_missing')
    const reversal = journal.reversal
    const credit = journal.credit
    let duplicateReversalId: Id<'moneyTransactions'> | undefined
    await backend.run(async (ctx) => {
      const {
        _id: _reversalId,
        _creationTime: _reversalCreationTime,
        ...reversalFields
      } = reversal
      duplicateReversalId = await ctx.db.insert('moneyTransactions', {
        ...reversalFields,
        transactionRef: `${reversal.transactionRef}:duplicate`,
      })
    })
    await expect(
      owner.query(readOwnerPayoutTransfer, readbackArgs),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    if (duplicateReversalId === undefined)
      throw new Error('duplicate_reversal_missing')
    await backend.run(async (ctx) => {
      await ctx.db.delete(duplicateReversalId!)
      await ctx.db.patch(reversal._id, { inputDigest: 'sha256:mismatched-reversal' })
    })
    await expect(
      owner.query(readOwnerPayoutTransfer, readbackArgs),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await backend.run(async (ctx) => {
      await ctx.db.patch(reversal._id, { inputDigest })
    })
    let duplicateCreditId: Id<'moneyLedgerEntries'> | undefined
    await backend.run(async (ctx) => {
      const { _id: _creditId, _creationTime: _creditCreationTime, ...creditFields } = credit
      duplicateCreditId = await ctx.db.insert('moneyLedgerEntries', {
        ...creditFields,
        entryRef: `${credit.entryRef}:duplicate`,
      })
    })
    await expect(
      owner.query(readOwnerPayoutTransfer, readbackArgs),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    if (duplicateCreditId === undefined)
      throw new Error('duplicate_credit_missing')
    let mismatchedCreditId: Id<'moneyLedgerEntries'> | undefined
    await backend.run(async (ctx) => {
      await ctx.db.delete(duplicateCreditId!)
      await ctx.db.delete(credit._id)
    })
    await expect(
      owner.query(readOwnerPayoutTransfer, readbackArgs),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await backend.run(async (ctx) => {
      const { _id: _creditId, _creationTime: _creditCreationTime, ...creditFields } = credit
      mismatchedCreditId = await ctx.db.insert('moneyLedgerEntries', {
        ...creditFields,
        amountUnits: '499',
      })
    })
    await expect(
      owner.query(readOwnerPayoutTransfer, readbackArgs),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    if (mismatchedCreditId === undefined)
      throw new Error('mismatched_credit_missing')
    await backend.run(async (ctx) => {
      await ctx.db.delete(mismatchedCreditId!)
      await ctx.db.delete(reversal._id)
    })
    await expect(
      owner.query(readOwnerPayoutTransfer, readbackArgs),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    const fabricatedPayoutRef = `${payoutRef}:fabricated-failed`
    const fabricatedCommandId = `${payoutCommandId}:fabricated`
    const fabricatedInputDigest = 'sha256:fabricated-input'
    const fabricatedRequestDigest = 'sha256:fabricated-request'
    const fabricatedIdempotencyKey = `${idempotencyKey}:fabricated`
    const fabricatedReservationRef = canonicalDigest({
      format: 'money-payout-reservation-transaction:v1',
      payoutRef: fabricatedPayoutRef,
      payoutCommandId: fabricatedCommandId,
      inputDigest: fabricatedInputDigest,
      idempotencyKey: fabricatedIdempotencyKey,
    } as const)
    const fabricatedSourceDigest = canonicalDigest({
      format: 'money-payout-reservation-source:v1',
      payoutRef: fabricatedPayoutRef,
      payoutCommandId: fabricatedCommandId,
      inputDigest: fabricatedInputDigest,
      requestDigest: fabricatedRequestDigest,
      idempotencyKey: fabricatedIdempotencyKey,
    } as const)
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyPayouts', {
        payoutRef: fabricatedPayoutRef,
        businessId: businessRef,
        owningAccountRef: accountRef,
        authorityPrincipalRef: principalId,
        authorityGrantRef,
        authorityGrantGeneration,
        authorityResourceRefs: [authorityResourceRef],
        currency: 'USD',
        exponent: 2,
        grossAccrualUnits: '550',
        rakeUnits: '50',
        providerNetUnits: '500',
        minimumPayoutUnits: '0',
        cadence: 'daily',
        state: 'failed',
        periodStart: '2026-07-02T00:00:00.000Z',
        periodEnd: '2026-07-03T00:00:00.000Z',
        providerAccountRef,
        destinationAccountId: 'acct_destination',
        payoutCommandId: fabricatedCommandId,
        inputDigest: fabricatedInputDigest,
        transferRequestDigest: fabricatedRequestDigest,
        transferStatus: 'failed',
        providerHeldBeforeUnits: '500',
        providerHeldAfterUnits: '0',
        providerPaidBeforeUnits: '0',
        idempotencyKey: fabricatedIdempotencyKey,
        createdAt: 2,
        updatedAt: 2,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: fabricatedReservationRef,
        kind: 'payout_accrual',
        idempotencyKey: fabricatedIdempotencyKey,
        inputDigest: fabricatedInputDigest,
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '500',
        exponent: 2,
        state: 'pending',
        expectedAccountVersion: 1,
        externalRef: fabricatedPayoutRef,
        createdAt: 2,
        updatedAt: 2,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${fabricatedReservationRef}:payout-reservation`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: '500',
        currency: 'USD',
        exponent: 2,
        transactionRef: fabricatedReservationRef,
        idempotencyKey: fabricatedIdempotencyKey,
        businessId: businessRef,
        sourceDigest: fabricatedSourceDigest,
        evidenceRefs: [
          `payout:${fabricatedPayoutRef}`,
          `payout-command:${fabricatedCommandId}`,
          `payout-input:${fabricatedInputDigest}`,
          `payout-request:${fabricatedRequestDigest}`,
        ],
        createdAt: 2,
      })
    })
    await expect(
      owner.query(readOwnerPayoutTransfer, {
        ...readbackArgs,
        payoutRef: fabricatedPayoutRef,
        idempotencyKey: fabricatedIdempotencyKey,
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })
})
