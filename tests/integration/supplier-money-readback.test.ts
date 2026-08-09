import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'
import { convexModules as modules, publishedBusinessOwner } from '../helpers/convex-fixtures'

const readOwnerProviderEarnings = anyApi.moneyLedger?.readOwnerProviderEarnings
if (readOwnerProviderEarnings === undefined) throw new Error('moneyLedger.readOwnerProviderEarnings missing')

describe('supplier money readback', () => {
  it('returns only source-recorded owner earnings with refunds, fees, and payouts reconciled', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'supplier-earnings')
    const businessRef = String(businessId)
    const accountRef = `provider:${businessRef}:USD`

    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '300',
        version: 4,
        state: 'active',
        createdAt: 1,
        updatedAt: 6,
      })

      const entries = [
        { entryRef: 'provider:one', accountRef, entryType: 'payout_accrual' as const, direction: 'credit' as const, amountUnits: '900', invocationRef: 'invocation:one' },
        { entryRef: 'rake:one', accountRef: 'ae:rake:USD', entryType: 'rake' as const, direction: 'credit' as const, amountUnits: '100' },
        { entryRef: 'provider:two', accountRef, entryType: 'payout_accrual' as const, direction: 'credit' as const, amountUnits: '450', invocationRef: 'invocation:two' },
        { entryRef: 'rake:two', accountRef: 'ae:rake:USD', entryType: 'rake' as const, direction: 'credit' as const, amountUnits: '50' },
        { entryRef: 'refund:provider', accountRef, entryType: 'refund' as const, direction: 'debit' as const, amountUnits: '450' },
        { entryRef: 'refund:rake', accountRef: 'ae:rake:USD', entryType: 'refund' as const, direction: 'debit' as const, amountUnits: '50' },
        { entryRef: 'payout:provider', accountRef, entryType: 'payout_accrual' as const, direction: 'debit' as const, amountUnits: '600' },
      ]
      for (const [index, entry] of entries.entries()) {
        await ctx.db.insert('moneyLedgerEntries', {
          ...entry,
          currency: 'USD',
          exponent: 2,
          transactionRef: `transaction:${index}`,
          idempotencyKey: `idempotency:${index}`,
          businessId: businessRef,
          sourceDigest: `source:${index}`,
          evidenceRefs: [`evidence:${index}`],
          createdAt: index + 1,
        })
      }
    })

    await expect(owner.query(readOwnerProviderEarnings, {})).resolves.toEqual({
      kind: 'available',
      businessId: businessRef,
      accounts: [{
        currency: 'USD',
        earnings: {
          kind: 'ok',
          businessId: businessRef,
          grossAccrual: { currency: 'USD', units: '1000', exponent: 2 },
          rake: { currency: 'USD', units: '100', exponent: 2 },
          providerNet: { currency: 'USD', units: '900', exponent: 2 },
          paidOut: { currency: 'USD', units: '600', exponent: 2 },
          held: { currency: 'USD', units: '300', exponent: 2 },
          truncated: false,
          evidence: 'source',
        },
        payout: {
          kind: 'ok',
          businessId: businessRef,
          accountState: 'missing',
          providerNet: { currency: 'USD', units: '0', exponent: 2 },
          minimumPayout: { currency: 'USD', units: '0', exponent: 2 },
          evidence: 'source',
        },
      }],
      accountsTruncated: false,
    })
  })

  it('does not expose supplier money without an authenticated owner', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.query(readOwnerProviderEarnings, {})).resolves.toEqual({ kind: 'error', code: 'unauthenticated' })
  })
})
