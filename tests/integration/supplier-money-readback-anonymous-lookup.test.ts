import {
  createSupplierMoneyBackend,
  readPayoutAccountByStripeId,
} from './supplier-money-readback-harness'
import { describe, expect, it } from 'vitest'
import { createConvexServerFunctionAssertion } from '@/lib/server/convex-source'

describe('supplier money readback anonymous lookup', () => {
  it('does not expose payout state through the anonymous Stripe-account lookup', async () => {
    const backend = createSupplierMoneyBackend()
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
