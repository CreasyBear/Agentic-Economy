import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/modules/money/public', async () => {
  const actual = await vi.importActual<typeof MoneyPublic>(
    '../../src/modules/money/public',
  )
  return {
    ...actual,
    evaluateLiveMoneyGate: () => ({
      kind: 'accepted' as const,
      policyId: 'test-money-policy',
      policyDigest: 'sha256:test-money-policy',
    }),
  }
})

import { internal } from '../../convex/_generated/api'
import { recordQualifiedUsePayoutAllocation } from '../../convex/moneyLedger'
import schema from '../../convex/schema'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
  STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
} from '@/modules/money/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type * as MoneyPublic from '@/modules/money/public'
import { createConvexServerFunctionAssertion } from '@/lib/server/convex-source'
import {
  convexModules as modules,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

const readPayoutAccountByStripeId =
  anyApi.moneyLedger?.readPayoutAccountByStripeId
if (readPayoutAccountByStripeId === undefined)
  throw new Error('moneyLedger.readPayoutAccountByStripeId missing')
const readOwnerProviderEarnings = anyApi.moneyLedger?.readOwnerProviderEarnings
if (readOwnerProviderEarnings === undefined)
  throw new Error('moneyLedger.readOwnerProviderEarnings missing')
const readOwnerPayoutTransfer = anyApi.moneyLedger?.readOwnerPayoutTransfer
if (readOwnerPayoutTransfer === undefined)
  throw new Error('moneyLedger.readOwnerPayoutTransfer missing')
const beginPayoutTransfer = anyApi.moneyLedger?.beginPayoutTransfer
if (beginPayoutTransfer === undefined)
  throw new Error('moneyLedger.beginPayoutTransfer missing')
const reconcilePayoutTransfer = anyApi.moneyLedger?.reconcilePayoutTransfer
if (reconcilePayoutTransfer === undefined)
  throw new Error('moneyLedger.reconcilePayoutTransfer missing')

describe('supplier money readback', () => {
  it('does not materialize a payout from a released charge until Qualified Use, then replays and applies a refund', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'supplier-earnings',
    )
    const businessRef = String(businessId)
    const ownerAccountId = 'user_supplier-earnings'
    const principalId = `principal:${businessRef}`
    const credentialId = `credential:${businessRef}`
    const transactionRef = `transaction:${businessRef}:charge`
    const providerAccountRef = accountRefForProvider(businessRef, 'USD')
    const billing = backend.withIdentity({
      subject: principalId,
      issuer: 'https://identity.example',
      tokenIdentifier: principalId,
    })

    await backend.run(async (ctx) => {
      const account = (
        row: Pick<
          Doc<'moneyAccounts'>,
          | 'accountRef'
          | 'accountKind'
          | 'accountId'
          | 'businessId'
          | 'balanceUnits'
        >,
      ): Promise<unknown> =>
        ctx.db.insert('moneyAccounts', {
          currency: 'USD',
          exponent: 2,
          recoveryDueUnits: '0',
          version: 1,
          state: 'active',
          createdAt: 1,
          updatedAt: 1,
          ...row,
        })
      await account({
        accountRef: accountRefForOwner(ownerAccountId, 'USD'),
        accountKind: 'operator_credit',
        accountId: ownerAccountId,
        balanceUnits: '0',
      })
      await account({
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        balanceUnits: '900',
      })
      await account({
        accountRef: accountRefForRake('USD'),
        accountKind: 'ae_rake',
        balanceUnits: '100',
      })
      await ctx.db.insert('moneyPayoutAccounts', {
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        stripeAccountId: `acct_${businessRef}`,
        state: 'ready',
        detailsSubmitted: true,
        recipientCapabilityActive: true,
        requirementsDigest: 'sha256:requirements',
        createdAt: 1,
        updatedAt: 1,
      })
      const budget = (
        windowKind: 'day' | 'month' | 'concurrency',
        windowStart: string,
        reservedUnits: string,
        reservedCount: number,
      ): Promise<unknown> =>
        ctx.db.insert('moneyCredentialBudgetStates', {
          principalId,
          credentialId,
          accountId: ownerAccountId,
          budgetPolicyRef: `budget:${businessRef}`,
          environment: 'production',
          generation: 1,
          windowKind,
          windowStart,
          currency: 'USD',
          exponent: 2,
          settledUnits: '0',
          reservedUnits,
          reservedCount,
          version: 1,
          updatedAt: 1,
        })
      await budget('day', '1970-01-01', '1000', 0)
      await budget('month', '1970-01', '1000', 0)
      await budget('concurrency', 'all', '0', 1)
      await ctx.db.insert('moneyTransactions', {
        transactionRef,
        kind: 'charge',
        idempotencyKey: transactionRef,
        inputDigest: 'sha256:input',
        accountId: ownerAccountId,
        principalId,
        currency: 'USD',
        credentialId,
        budgetPolicyRef: `budget:${businessRef}`,
        budgetGeneration: 1,
        budgetEnvironment: 'production',
        budgetDayStart: '1970-01-01',
        budgetMonthStart: '1970-01',
        budgetState: 'reserved',
        amountUnits: '1000',
        exponent: 2,
        state: 'outcome_unknown',
        expectedAccountVersion: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      const entry = (
        row: Pick<
          Doc<'moneyLedgerEntries'>,
          | 'entryRef'
          | 'accountRef'
          | 'entryType'
          | 'direction'
          | 'amountUnits'
          | 'principalId'
          | 'businessId'
          | 'invocationRef'
          | 'attemptRef'
        >,
      ): Promise<unknown> =>
        ctx.db.insert('moneyLedgerEntries', {
          transactionRef,
          idempotencyKey: transactionRef,
          sourceDigest: 'sha256:source',
          evidenceRefs: ['evidence:charge'],
          currency: 'USD',
          exponent: 2,
          createdAt: 1,
          ...row,
        })
      await entry({
        entryRef: `${transactionRef}:charge`,
        accountRef: accountRefForOwner(ownerAccountId, 'USD'),
        entryType: 'charge',
        direction: 'debit',
        amountUnits: '1000',
        principalId,
        invocationRef: `invocation:${businessRef}`,
        attemptRef: `attempt:${businessRef}`,
      })
      await entry({
        entryRef: `${transactionRef}:provider`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'credit',
        amountUnits: '900',
        businessId: businessRef,
        invocationRef: `invocation:${businessRef}`,
        attemptRef: `attempt:${businessRef}`,
      })
      await entry({
        entryRef: `${transactionRef}:rake`,
        accountRef: accountRefForRake('USD'),
        entryType: 'rake',
        direction: 'credit',
        amountUnits: '100',
        businessId: businessRef,
      })
    })

    const reconcile = {
      principalId,
      transactionRef,
      refundTransactionRef: `${transactionRef}:refund`,
      refundIdempotencyKey: `${transactionRef}:refund`,
      refundInputDigest: 'sha256:refund-input',
      sourceDigest: 'sha256:source',
      evidenceRefs: ['evidence:charge'],
      observedAt: 2,
    }
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, {
        ...reconcile,
        outcome: 'released',
      }),
    ).resolves.toMatchObject({ kind: 'accepted', outcome: 'released' })

    const first = await owner.query(readOwnerProviderEarnings, {})
    expect(first).toMatchObject({
      kind: 'available',
      businessId: businessRef,
      accounts: [
        {
          currency: 'USD',
          earnings: {
            kind: 'ok',
            grossAccrual: { currency: 'USD', units: '1000', exponent: 2 },
            rake: { currency: 'USD', units: '100', exponent: 2 },
            providerNet: { currency: 'USD', units: '900', exponent: 2 },
            paidOut: { currency: 'USD', units: '0', exponent: 2 },
            held: { currency: 'USD', units: '900', exponent: 2 },
          },
          payout: {
            kind: 'ok',
            accountState: 'ready',
            providerNet: { currency: 'USD', units: '0', exponent: 2 },
            minimumPayout: { currency: 'USD', units: '0', exponent: 2 },
          },
        },
      ],
      accountsTruncated: false,
    })
    if (first.kind !== 'available')
      throw new Error('owner earnings unavailable after release')
    const firstPayout = first.accounts[0]?.payout
    if (firstPayout === undefined) throw new Error('payout readback missing')
    expect(firstPayout).not.toHaveProperty('payoutState')
    expect(firstPayout).not.toHaveProperty('payoutRef')
    expect(firstPayout).not.toHaveProperty('idempotencyKey')
    const qualifiedIdentity = {
      invocationRef: `invocation:${businessRef}`,
      attemptRef: `attempt:${businessRef}`,
      effectGeneration: 1,
    }
    const qualifiedMaterial = {
      ...qualifiedIdentity,
      businessId: businessRef,
      operationRef: `operation:${businessRef}`,
      publicationRef: `publication:${businessRef}`,
      publicationRevision: 1,
      contractDigest: 'sha256:contract',
      bindingDigest: 'sha256:binding',
      principalClass: 'agent_key' as const,
      requestDigest: 'sha256:request',
      responseDigest: 'sha256:response',
      evidenceRefs: ['evidence:qualified'],
    }
    const qualifiedRef = qualifiedUseRef(qualifiedIdentity)
    const materialDigest = qualifiedUseMaterialDigest(qualifiedMaterial)
    const qualifiedReceipt = {
      qualifiedUseRef: qualifiedRef,
      materialDigest,
      ...qualifiedMaterial,
      environment: 'production' as const,
      qualifiedAt: 2,
      usageRef: `usage:${businessRef}`,
      transactionRef,
    }
    const payoutRef = await backend.run(async (ctx) => {
      await ctx.db.insert('moneyUsageEvents', {
        usageRef: `usage:${businessRef}`,
        principalId,
        credentialId,
        currency: 'USD',
        accountId: ownerAccountId,
        exponent: 2,
        serviceRef: `service:${businessRef}`,
        offeringRef: `offering:${businessRef}`,
        businessId: businessRef,
        invocationRef: qualifiedIdentity.invocationRef,
        attemptRef: qualifiedIdentity.attemptRef,
        operationKey: qualifiedMaterial.operationRef,
        priceDigest: 'sha256:price',
        chargeState: 'paid',
        amountUnits: '1000',
        transactionRef,
        observedAt: 1,
      })
      await recordQualifiedUsePayoutAllocation(ctx, qualifiedReceipt, principalId)
      await ctx.db.insert('qualifiedUseReceipts', qualifiedReceipt)
      const payouts = await ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_updatedAt', (q) =>
          q.eq('businessId', businessRef).eq('currency', 'USD'),
        )
        .order('desc')
        .take(1)
      const dailyPayout = payouts[0]
      if (dailyPayout === undefined) throw new Error('daily payout missing')
      return dailyPayout.payoutRef
    })
    await backend.run(async (ctx) => {
      const providerAccount = await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique()
      const payout = await ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', payoutRef))
        .unique()
      if (providerAccount === null || payout === null)
        throw new Error('dispute fixture missing')
      await ctx.db.patch(providerAccount._id, {
        balanceUnits: '0',
        version: providerAccount.version + 1,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: `payout:${businessRef}`,
        kind: 'payout_accrual',
        idempotencyKey: `payout:${businessRef}`,
        inputDigest: 'sha256:payout-input',
        principalId: `business:${businessRef}`,
        currency: 'USD',
        amountUnits: '900',
        exponent: 2,
        state: 'applied',
        expectedAccountVersion: providerAccount.version,
        externalRef: payoutRef,
        createdAt: 3,
        updatedAt: 3,
      })
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `payout:${businessRef}:entry`,
        accountRef: providerAccountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: '900',
        currency: 'USD',
        exponent: 2,
        transactionRef: `payout:${businessRef}`,
        idempotencyKey: `payout:${businessRef}`,
        businessId: businessRef,
        sourceDigest: 'sha256:payout',
        evidenceRefs: ['evidence:payout'],
        createdAt: 3,
      })
      await ctx.db.patch(payout._id, {
        state: 'paid',
        providerHeldBeforeUnits: '900',
        providerHeldAfterUnits: '0',
        providerPaidBeforeUnits: '0',
        providerPaidAfterUnits: '900',
        updatedAt: 3,
      })
    })
    const receiptBefore = await backend.run(async (ctx) =>
      await ctx.db.query('qualifiedUseReceipts').withIndex('by_qualifiedUseRef', (q) => q.eq('qualifiedUseRef', qualifiedRef)).unique(),
    )
    const dispute = {
      qualifiedUseRef: qualifiedRef,
      disputeRef: `dispute:${businessRef}`,
      sourceDigest: 'sha256:dispute-source',
      evidenceRefs: ['evidence:dispute'],
      observedAt: 4,
    }
    await expect(
      backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, dispute),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transactionRef: `qualified-use-dispute-refund:${qualifiedRef}`,
    })
    const receiptAfter = await backend.run(async (ctx) =>
      await ctx.db.query('qualifiedUseReceipts').withIndex('by_qualifiedUseRef', (q) => q.eq('qualifiedUseRef', qualifiedRef)).unique(),
    )
    expect(receiptAfter).toEqual(receiptBefore)

    const beforeReplay = await backend.run(async (ctx) => ({
      refunds: await ctx.db.query('moneyTransactions').withIndex('by_reversalOf', (q) => q.eq('reversalOf', transactionRef)).take(2),
      entries: await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', `qualified-use-dispute-refund:${qualifiedRef}`)).take(4),
      provider: await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef)).unique(),
    }))
    expect(beforeReplay.entries).toHaveLength(3)
    const disputeReplay = await backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, dispute)
    expect(disputeReplay).toEqual({
      kind: 'accepted',
      transactionRef: `qualified-use-dispute-refund:${qualifiedRef}`,
      currency: 'USD',
    })
    const afterReplay = await backend.run(async (ctx) => ({
      refunds: await ctx.db.query('moneyTransactions').withIndex('by_reversalOf', (q) => q.eq('reversalOf', transactionRef)).take(2),
      entries: await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', `qualified-use-dispute-refund:${qualifiedRef}`)).take(4),
      provider: await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef)).unique(),
    }))
    expect(afterReplay.entries).toHaveLength(3)
    expect(afterReplay).toEqual(beforeReplay)
    await expect(
      backend.mutation(internal.moneyLedger.reverseDisputedQualifiedUse, {
        ...dispute,
        sourceDigest: 'sha256:changed',
      }),
    ).resolves.toMatchObject({ kind: 'refused', code: 'ledger_idempotency_conflict' })
    const refunded = await owner.query(readOwnerProviderEarnings, {})
    expect(refunded).toMatchObject({
      kind: 'available',
      accounts: [
        {
          earnings: {
            providerNet: { currency: 'USD', units: '0', exponent: 2 },
            paidOut: { currency: 'USD', units: '900', exponent: 2 },
            held: { currency: 'USD', units: '0', exponent: 2 },
            recoveryDue: { currency: 'USD', units: '900', exponent: 2 },
          },
          payout: {
            payoutRef,
            providerNet: { currency: 'USD', units: '900', exponent: 2 },
          },
        },
      ],
    })
    const laterObservedAt = Date.UTC(1970, 1, 5)
    const insertRecoveryCharge = async (
      suffix: string,
      providerUnits: string,
      recoveryUnits: string,
    ): Promise<string> => {
      const ref = `transaction:${businessRef}:recovery:${suffix}`
      const invocation = `invocation:${businessRef}:recovery:${suffix}`
      const attempt = `attempt:${businessRef}:recovery:${suffix}`
      await backend.run(async (ctx) => {
        await ctx.db.insert('moneyTransactions', {
          transactionRef: ref,
          kind: 'charge',
          idempotencyKey: ref,
          accountId: ownerAccountId,
          inputDigest: `sha256:recovery-input:${suffix}`,
          principalId,
          currency: 'USD',
          amountUnits: '700',
          exponent: 2,
          state: 'outcome_unknown',
          expectedAccountVersion: 1,
          createdAt: laterObservedAt,
          updatedAt: laterObservedAt,
        })
        const entry = (
          row: Pick<
            Doc<'moneyLedgerEntries'>,
            | 'entryRef'
            | 'accountRef'
            | 'entryType'
            | 'direction'
            | 'amountUnits'
            | 'businessId'
            | 'invocationRef'
            | 'attemptRef'
          >,
        ): Promise<unknown> =>
          ctx.db.insert('moneyLedgerEntries', {
            transactionRef: ref,
            idempotencyKey: ref,
            sourceDigest: 'sha256:recovery-source',
            evidenceRefs: ['evidence:recovery-charge'],
            currency: 'USD',
            exponent: 2,
            createdAt: laterObservedAt,
            ...row,
          })
        await entry({
          entryRef: `${ref}:charge`,
          accountRef: accountRefForOwner(ownerAccountId, 'USD'),
          entryType: 'charge',
          direction: 'debit',
          amountUnits: '700',
          invocationRef: invocation,
          attemptRef: attempt,
        })
        await entry({
          entryRef: `${ref}:provider`,
          accountRef: providerAccountRef,
          entryType: 'payout_accrual',
          direction: 'credit',
          amountUnits: providerUnits,
          businessId: businessRef,
          invocationRef: invocation,
          attemptRef: attempt,
        })
        await entry({
          entryRef: `${ref}:rake`,
          accountRef: accountRefForRake('USD'),
          entryType: 'rake',
          direction: 'credit',
          amountUnits: '100',
          businessId: businessRef,
        })
        await entry({
          entryRef: `${ref}:provider-recovery`,
          accountRef: providerAccountRef,
          entryType: 'payout_accrual',
          direction: 'debit',
          amountUnits: recoveryUnits,
          businessId: businessRef,
          invocationRef: invocation,
          attemptRef: attempt,
        })
      })
      return ref
    }
    const recoveryChargeA = await insertRecoveryCharge('a', '600', '600')
    const recoveryChargeB = await insertRecoveryCharge('b', '600', '300')
    await backend.run(async (ctx) => {
      const provider = await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', providerAccountRef))
        .unique()
      const rake = await ctx.db
        .query('moneyAccounts')
        .withIndex('by_accountRef', (q) => q.eq('accountRef', accountRefForRake('USD')))
        .unique()
      if (provider === null || rake === null) throw new Error('recovery accounts missing')
      await ctx.db.patch(provider._id, {
        balanceUnits: '300',
        recoveryDueUnits: '0',
        version: provider.version + 1,
        updatedAt: laterObservedAt,
      })
      await ctx.db.patch(rake._id, {
        balanceUnits: '200',
        version: rake.version + 1,
        updatedAt: laterObservedAt,
      })
    })
    const recoveryEvidence = {
      sourceDigest: 'sha256:recovery-source',
      evidenceRefs: ['evidence:recovery-charge'],
    }
    const releaseArgs = (ref: string) => ({
      principalId,
      transactionRef: ref,
      outcome: 'released' as const,
      refundTransactionRef: `${ref}:refund`,
      refundIdempotencyKey: `${ref}:refund`,
      refundInputDigest: `sha256:refund:${ref}`,
      ...recoveryEvidence,
      observedAt: laterObservedAt,
    })
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, releaseArgs(recoveryChargeA)),
    ).resolves.toMatchObject({ kind: 'accepted', outcome: 'released' })
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, releaseArgs(recoveryChargeB)),
    ).resolves.toMatchObject({ kind: 'accepted', outcome: 'released' })
    const recoveryEntries = await backend.run(async (ctx) => ({
      a: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', recoveryChargeA))
        .take(5),
      b: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', recoveryChargeB))
        .take(5),
      periods: await ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_updatedAt', (q) =>
          q.eq('businessId', businessRef).eq('currency', 'USD'),
        )
        .order('desc')
        .take(4),
    }))
    expect(recoveryEntries.a).toHaveLength(4)
    expect(recoveryEntries.b).toHaveLength(4)
    expect(
      recoveryEntries.a.filter(
        (entry) =>
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit',
      ),
    ).toHaveLength(1)
    expect(
      recoveryEntries.b.filter(
        (entry) =>
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit',
      ),
    ).toHaveLength(1)
    expect(recoveryEntries.periods).toHaveLength(1)
    const beforeRecoveryReplay = recoveryEntries.periods
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, releaseArgs(recoveryChargeA)),
    ).resolves.toEqual({
      kind: 'accepted',
      transactionRef: recoveryChargeA,
      outcome: 'released',
    })
    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, releaseArgs(recoveryChargeB)),
    ).resolves.toEqual({
      kind: 'accepted',
      transactionRef: recoveryChargeB,
      outcome: 'released',
    })
    const afterRecoveryReplay = await backend.run(async (ctx) =>
      await ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_updatedAt', (q) =>
          q.eq('businessId', businessRef).eq('currency', 'USD'),
        )
        .order('desc')
        .take(4),
    )
    expect(afterRecoveryReplay).toEqual(beforeRecoveryReplay)
    const recoveryEarnings = await owner.query(readOwnerProviderEarnings, {})
    expect(recoveryEarnings).toMatchObject({
      kind: 'available',
      accounts: [
        {
          earnings: {
            providerNet: { currency: 'USD', units: '1200', exponent: 2 },
            paidOut: { currency: 'USD', units: '900', exponent: 2 },
            held: { currency: 'USD', units: '300', exponent: 2 },
            recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
          },
        },
      ],
    })
    const replayRecoveryEntries = await backend.run(async (ctx) => ({
      a: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', recoveryChargeA))
        .take(5),
      b: await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) => q.eq('transactionRef', recoveryChargeB))
        .take(5),
    }))
    expect(replayRecoveryEntries.a).toHaveLength(4)
    expect(replayRecoveryEntries.b).toHaveLength(4)
    expect(
      replayRecoveryEntries.a.filter(
        (entry) =>
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit',
      ),
    ).toHaveLength(1)
    expect(
      replayRecoveryEntries.b.filter(
        (entry) =>
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit',
      ),
    ).toHaveLength(1)
  })
  it('shows the canonical daily payout as accountState missing before Connect', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'supplier-earnings-missing-connect',
    )
    const businessRef = String(businessId)
    const periodStart = '2026-07-01T00:00:00.000Z'
    const periodEnd = '2026-07-02T00:00:00.000Z'
    const payoutRef = canonicalDigest({
      format: 'money-daily-payout:v1',
      businessId: businessRef,
      currency: 'USD',
      periodStart,
      periodEnd,
    } as const)
    const providerAccountRef = accountRefForProvider(businessRef, 'USD')
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '5000',
        recoveryDueUnits: '0',
        version: 1,
        state: 'active',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('moneyPayouts', {
        payoutRef,
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        grossAccrualUnits: '5500',
        rakeUnits: '500',
        providerNetUnits: '5000',
        minimumPayoutUnits: '0',
        cadence: 'daily',
        state: 'held_threshold',
        periodStart,
        periodEnd,
        providerAccountRef,
        idempotencyKey: payoutRef,
        createdAt: 1,
        updatedAt: 2,
      })
      await ctx.db.insert('moneyPayouts', {
        payoutRef: 'legacy-undefined-cadence',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        grossAccrualUnits: '1',
        rakeUnits: '0',
        providerNetUnits: '1',
        minimumPayoutUnits: '0',
        state: 'paid',
        periodStart: 'legacy-period-start',
        periodEnd: 'legacy-period-end',
        idempotencyKey: 'legacy-idempotency',
        createdAt: 3,
        updatedAt: 99,
      })
    })
    await expect(owner.query(readOwnerProviderEarnings, {})).resolves.toMatchObject({
      kind: 'available',
      accounts: [
        {
          currency: 'USD',
          payout: {
            kind: 'ok',
            accountState: 'missing',
            payoutState: 'held_threshold',
            payoutRef,
            providerNet: { currency: 'USD', units: '5000', exponent: 2 },
          },
        },
      ],
    })
  })

  it('does not expose supplier money without an authenticated owner', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.query(readOwnerProviderEarnings, {})).resolves.toEqual(
      { kind: 'error', code: 'unauthenticated' },
    )
  })
  it('refuses source-labelled earnings totals when the bounded ledger scan overflows', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'supplier-earnings-overflow',
    )
    const businessRef = String(businessId)
    const accountRef = accountRefForProvider(businessRef, 'USD')
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '101',
        recoveryDueUnits: '0',
        version: 1,
        state: 'active',
        createdAt: 1,
        updatedAt: 1,
      })
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('moneyLedgerEntries', {
          entryRef: `entry:${index}`,
          transactionRef: `transaction:${index}`,
          idempotencyKey: `transaction:${index}`,
          accountRef,
          entryType: 'payout_accrual',
          direction: 'credit',
          amountUnits: '1',
          currency: 'USD',
          exponent: 2,
          businessId: businessRef,
          sourceDigest: 'sha256:source',
          evidenceRefs: ['evidence:charge'],
          createdAt: index,
        })
      }
    })

    await expect(owner.query(readOwnerProviderEarnings, {})).resolves.toEqual({
      kind: 'error',
      code: 'source_unavailable',
    })
  })
  it('counts reversed payout debits and exact reversal credits once', async () => {
    const backend = convexTest(schema, modules)
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
      const backend = convexTest(schema, modules)
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
  it('does not expose payout state through the anonymous Stripe-account lookup', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyPayoutAccounts', {
        businessId: 'business:anonymous-payout',
        currency: 'USD',
        exponent: 2,
        stripeAccountId: 'acct_anonymous_payout',
        state: 'ready',
        detailsSubmitted: true,
        recipientCapabilityActive: true,
        requirementsDigest: 'sha256:requirements',
        createdAt: 1,
        updatedAt: 1,
      })
    })
    await expect(
      backend.query(readPayoutAccountByStripeId, {
        stripeAccountId: 'acct_anonymous_payout',
      }),
    ).resolves.toEqual([])
    const previousServerKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN =
      'server-function-token-for-money-readback-tests-32'
    try {
      const serviceAuth = await createConvexServerFunctionAssertion({
        operation: 'moneyLedger:readPayoutAccountByStripeId',
        scope: 'money:payout_binding_read',
        command: { stripeAccountId: 'acct_anonymous_payout' },
      })
      await expect(
        backend.query(readPayoutAccountByStripeId, {
          stripeAccountId: 'acct_anonymous_payout',
          serviceAuth,
        }),
      ).resolves.toEqual([
        {
          businessId: 'business:anonymous-payout',
          currency: 'USD',
          exponent: 2,
          stripeAccountId: 'acct_anonymous_payout',
        },
      ])
    } finally {
      if (previousServerKey === undefined)
        delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
      else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServerKey
    }
  })
  it('refuses malformed recovery debit-credit pairs instead of excluding them', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(
      backend,
      'supplier-earnings-malformed-recovery',
    )
    const businessRef = String(businessId)
    const providerAccountRef = accountRefForProvider(businessRef, 'USD')
    const transactionRef = `transaction:${businessRef}:malformed-recovery`
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '0',
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

  it('rejects payout reversal credits whose original is outside the target projection', async () => {
    const backend = convexTest(schema, modules)
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

  it('reads failed payout amount from its immutable reservation and refuses inconsistent journals', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'supplier-earnings-reservation-readback',
    )
    const businessRef = String(businessId)
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
    const providerAccountRef = accountRefForProvider(businessRef, 'USD')
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
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '500',
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
    const beginArgs = await withSourceWrite('billing', {
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
      authority: { principalId: `principal:${businessRef}` },
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
