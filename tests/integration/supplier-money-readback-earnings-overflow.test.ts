import {
  createSupplierMoneyOwner,
  readOwnerProviderEarnings,
} from './supplier-money-readback-harness'
import { describe, expect, it } from 'vitest'
import { accountRefForProvider } from '@/modules/money/public'

describe('supplier money readback earnings overflow', () => {
  it('refuses source-labelled earnings totals when the bounded ledger scan overflows', async () => {
    const { backend, owner, businessRef } = await createSupplierMoneyOwner(
      'supplier-earnings-overflow',
    )
    const accountRef = accountRefForProvider(businessRef, 'USD')
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef,
        accountKind: 'provider_earnings',
        businessId: businessRef,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '101',
        heldUnits: '0',
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
})
