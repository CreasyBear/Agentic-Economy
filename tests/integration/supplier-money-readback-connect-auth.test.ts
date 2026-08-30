import {
  createSupplierMoneyBackend,
  createSupplierMoneyOwner,
  readOwnerProviderEarnings,
} from './supplier-money-readback-harness'
import { describe, expect, it } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('supplier money readback connect auth', () => {
  it('shows the canonical daily payout as accountState missing before Connect', async () => {
    const { backend, owner, businessRef, providerAccountRef, accountRef, principalId } =
      await createSupplierMoneyOwner('supplier-earnings-missing-connect')
    const periodStart = '2026-07-01T00:00:00.000Z'
    const periodEnd = '2026-07-02T00:00:00.000Z'
    const payoutRef = canonicalDigest({
      format: 'money-daily-payout:v1',
      businessId: businessRef,
      currency: 'USD',
      periodStart,
      periodEnd,
    } as const)
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef: providerAccountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '5000',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 1,
        state: 'active',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('moneyPayouts', {
        payoutRef,
        businessId: businessRef,
        owningAccountRef: accountRef,
        authorityPrincipalRef: principalId,
        authorityGrantRef: 'grant:supplier-earnings-missing-connect',
        authorityGrantGeneration: 1,
        authorityResourceRefs: [`business:${businessRef}`],
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
    const backend = createSupplierMoneyBackend()
    await expect(backend.query(readOwnerProviderEarnings, {})).resolves.toEqual(
      { kind: 'error', code: 'unauthenticated' },
    )
  })
})
