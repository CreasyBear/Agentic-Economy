import { describe, expect, it, vi } from 'vitest'

import { convexTestWithMarketComponents } from '../../../../tests/helpers/convex-fixtures'
const enqueueAccountNotice = vi.hoisted(() => vi.fn())
vi.mock('../../principalAccount/notifications/enqueue', () => ({ enqueueAccountNotice }))

import { emitJourneyEvent } from '../../journey/events'
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
      expect(enqueueAccountNotice).toHaveBeenCalledTimes(1)
      expect(enqueueAccountNotice).toHaveBeenCalledWith(ctx, { eventKind: 'first_call_done', accountRef: 'acct', sourceEventRef: 'c' })
    })
  })

  it('enqueues first_call_failed on the first refusal after agent_connected', async () => {
    enqueueAccountNotice.mockClear()
    const backend = convexTestWithMarketComponents()
    const refused = { state: 'refused', result: { kind: 'refused', code: 'x' } } as never
    const call = (callRef: string, ownerId: string) => ({ callRef, ownerId, environment: 'production', promotionalCreditAllocation: undefined }) as never
    await backend.run(async (ctx) => {
      await journeyForFinalization(ctx, call('c0', 'noagent'), refused, 1)
      expect(enqueueAccountNotice).not.toHaveBeenCalled()
      await emitJourneyEvent(ctx, 'acct2', 'agent_connected')
      await journeyForFinalization(ctx, call('c1', 'acct2'), refused, 1)
      expect(enqueueAccountNotice).toHaveBeenCalledWith(ctx, { eventKind: 'first_call_failed', accountRef: 'acct2', sourceEventRef: 'c1' })
    })
  })
})
