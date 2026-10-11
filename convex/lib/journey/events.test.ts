import { describe, expect, it } from 'vitest'

import { convexTestWithMarketComponents } from '../../../tests/helpers/convex-fixtures'
import { emitFundingJourneyEvent, emitJourneyEvent } from './events'

describe('journey event props', () => {
  it('records funding_source on activated and on funded, and isNewAccount false without a signup', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async (ctx) => {
      await emitJourneyEvent(ctx, 'account:a', 'activated', { props: { funding_source: 'sandbox' } })
      await emitFundingJourneyEvent(ctx, 'account:a', 'funding:1', 'stripe')
      await emitJourneyEvent(ctx, 'account:a', 'first_call')
      const byName = async (name: 'activated' | 'funded' | 'first_call') => (await ctx.db.query('journeyEvents')
        .withIndex('by_accountRef_and_name', q => q.eq('accountRef', 'account:a').eq('name', name)).unique())
      expect((await byName('activated'))?.props).toEqual({ funding_source: 'sandbox', isNewAccount: 'false' })
      expect((await byName('funded'))?.props).toEqual({ funding_source: 'stripe', isNewAccount: 'false' })
      expect((await byName('first_call'))?.props).toEqual({ isNewAccount: 'false' })
    })
  })

  it('merges first touch and isNewAccount into later events', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async (ctx) => {
      const lastAction = { actorPrincipalRef: 'p', activeAccountRef: 'account:b', correlationRef: 'c', idempotencyRef: 'i' }
      await ctx.db.insert('accounts', {
        accountRef: 'account:b', displayName: 'b', lifecycle: 'active', recoveryPolicy: { kind: 'no_transfer', revision: 1 },
        creationActorPrincipalRef: 'p', creationIdempotencyRef: 'i', initialOwnershipRef: 'o', currentOwnershipRef: 'o',
        revision: 1, createdAt: 1, updatedAt: 1, lastAction,
        firstTouch: { source: 'x', medium: 'social', at: 1 },
      })
      await emitJourneyEvent(ctx, 'account:b', 'signed_up')
      await emitFundingJourneyEvent(ctx, 'account:b', 'funding:1', 'stripe')
      const funded = await ctx.db.query('journeyEvents')
        .withIndex('by_accountRef_and_name', q => q.eq('accountRef', 'account:b').eq('name', 'funded')).unique()
      expect(funded?.props).toEqual({ funding_source: 'stripe', first_source: 'x', first_medium: 'social', isNewAccount: 'true' })
    })
  })
})
