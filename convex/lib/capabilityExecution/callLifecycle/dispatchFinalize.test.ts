import { describe, expect, it } from 'vitest'

import { convexTestWithMarketComponents } from '../../../../tests/helpers/convex-fixtures'
import { callFundingSource, journeyForFinalization } from './dispatchFinalize'

const completed = { state: 'completed', result: { kind: 'completed', receipt: { receiptRef: 'r' } } } as never
const grants = [{ grantRef: 'g', amountUnits: '5', expiresAt: 1 }]
const allocation = (purchasedUnits: string) => ({ version: 'ae.promotional-credit-allocation:v1' as const, purchasedUnits, grants })

describe('journeyForFinalization funding source', () => {
  it('classifies funding source', () => {
    expect(callFundingSource({ environment: 'sandbox', promotionalCreditAllocation: undefined })).toBe('sandbox')
    expect(callFundingSource({ environment: 'production', promotionalCreditAllocation: allocation('0') })).toBe('trial')
    expect(callFundingSource({ environment: 'production', promotionalCreditAllocation: allocation('3') })).toBe('real')
    expect(callFundingSource({ environment: 'production', promotionalCreditAllocation: undefined })).toBe('real')
  })

  it('activates only on a real-credit receipted call; trial emits first_call tagged trial', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async (ctx) => {
      const events = async (name: 'activated' | 'first_call') => await ctx.db.query('journeyEvents')
        .withIndex('by_accountRef_and_name', q => q.eq('accountRef', 'acct').eq('name', name)).unique()
      const call = (promotionalCreditAllocation?: ReturnType<typeof allocation>) =>
        ({ callRef: 'c', ownerId: 'acct', environment: 'production', promotionalCreditAllocation }) as never
      await journeyForFinalization(ctx, call(allocation('0')), completed, 1)
      expect((await events('first_call'))?.props).toEqual({ funding_source: 'trial' })
      expect(await events('activated')).toBeNull()
      await journeyForFinalization(ctx, call(), completed, 2)
      expect((await events('activated'))?.props).toEqual({ funding_source: 'real' })
    })
  })
})
