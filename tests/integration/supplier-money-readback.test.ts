import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import type { Doc } from '../../convex/_generated/dataModel'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
} from '@/modules/money/public'
import { createConvexServerFunctionAssertion } from '@/lib/server/convex-source'
import {
  convexModules as modules,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'

const readPayoutAccountByStripeId =
  anyApi.moneyLedger?.readPayoutAccountByStripeId
if (readPayoutAccountByStripeId === undefined)
  throw new Error('moneyLedger.readPayoutAccountByStripeId missing')
const readOwnerProviderEarnings = anyApi.moneyLedger?.readOwnerProviderEarnings
if (readOwnerProviderEarnings === undefined)
  throw new Error('moneyLedger.readOwnerProviderEarnings missing')

describe('supplier money readback', () => {
  it('materializes one current payout period from a released charge, replays, and applies a refund', async () => {
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
          budgetPolicyRef: `budget:${businessRef}`,
          environment: 'sandbox',
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
        principalId,
        currency: 'USD',
        credentialId,
        budgetPolicyRef: `budget:${businessRef}`,
        budgetGeneration: 1,
        budgetEnvironment: 'sandbox',
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
            payoutState: 'held_threshold',
            payoutRef: expect.any(String),
            idempotencyKey: expect.any(String),
            stripeAccountId: `acct_${businessRef}`,
            providerNet: { currency: 'USD', units: '900', exponent: 2 },
            minimumPayout: { currency: 'USD', units: '0', exponent: 2 },
          },
        },
      ],
      accountsTruncated: false,
    })
    if (first.kind !== 'available')
      throw new Error('owner earnings unavailable after release')
    const payoutRef = first.accounts[0]?.payout.payoutRef
    expect(payoutRef).toEqual(expect.any(String))

    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, {
        ...reconcile,
        outcome: 'released',
      }),
    ).resolves.toMatchObject({ kind: 'accepted', outcome: 'released' })
    const replay = await owner.query(readOwnerProviderEarnings, {})
    expect(replay).toMatchObject({
      kind: 'available',
      accounts: [
        {
          payout: {
            payoutRef,
            providerNet: { currency: 'USD', units: '900', exponent: 2 },
          },
        },
      ],
    })

    await expect(
      billing.mutation(internal.moneyLedger.reconcileCharge, {
        ...reconcile,
        outcome: 'not_released',
      }),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transactionRef: `${transactionRef}:refund`,
    })
    const refunded = await owner.query(readOwnerProviderEarnings, {})
    expect(refunded).toMatchObject({
      kind: 'available',
      accounts: [
        {
          earnings: {
            providerNet: { currency: 'USD', units: '0', exponent: 2 },
            held: { currency: 'USD', units: '0', exponent: 2 },
          },
          payout: {
            payoutRef,
            providerNet: { currency: 'USD', units: '0', exponent: 2 },
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
})
