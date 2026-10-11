import { describe, expect, it } from 'vitest'

import { convexTestWithMarketComponents } from '../../../tests/helpers/convex-fixtures'
import { emitFundingJourneyEvent, emitJourneyEvent } from './events'

describe('journey event props', () => {
  it('records funding_source on activated and on funded, and omits props otherwise', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async (ctx) => {
      await emitJourneyEvent(ctx, 'account:a', 'activated', { props: { funding_source: 'sandbox' } })
      await emitFundingJourneyEvent(ctx, 'account:a', 'funding:1', 'stripe')
      await emitJourneyEvent(ctx, 'account:a', 'first_call')
      const byName = async (name: 'activated' | 'funded' | 'first_call') => (await ctx.db.query('journeyEvents')
        .withIndex('by_accountRef_and_name', q => q.eq('accountRef', 'account:a').eq('name', name)).unique())
      expect((await byName('activated'))?.props).toEqual({ funding_source: 'sandbox' })
      expect((await byName('funded'))?.props).toEqual({ funding_source: 'stripe' })
      expect((await byName('first_call'))?.props).toBeUndefined()
    })
  })
})
