import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectRuntime, sourceMocks, type Provider } from './owner-payout-server-harness'
import {
  createOwnerConnectAccountThroughSource,
  createOwnerExpressLoginLinkThroughSource,
  readOwnerConnectReadinessThroughSource,
} from '@/modules/money/server'

const obligationReadback = {
  kind: 'available', businessId: 'business-1', obligations: [{
    obligationRef: 'provider-obligation:call-1', callRef: 'call-1', toolRef: 'tool-1',
    currency: 'USDC', exponent: 6, amountUnits: '1000000', state: 'settled', createdAt: 1,
  }], truncated: false,
}

afterEach(() => sourceMocks.callSourceQuery.mockReset())

describe('owner Stripe account authority', () => {
  it('does not infer Stripe readiness or authorize account setup from a settled x402 obligation', async () => {
    const createOrRecoverConnectAccount = vi.fn<Provider['createOrRecoverConnectAccount']>()
    sourceMocks.callSourceQuery.mockResolvedValue(obligationReadback)
    expect(await readOwnerConnectReadinessThroughSource()).toEqual({
      kind: 'refused', code: 'payout_not_ready', retryable: false,
    })
    expect(await createOwnerConnectAccountThroughSource(
      { businessId: 'business-1', currency: 'USDC', idempotencyKey: 'setup:one' },
      {}, connectRuntime(createOrRecoverConnectAccount),
    )).toEqual({ kind: 'refused', code: 'payout_not_ready', retryable: false })
    expect(createOrRecoverConnectAccount).not.toHaveBeenCalled()
  })

  it('does not open Stripe for an unrelated owner or ambiguous Provider identity', async () => {
    const createExpressLoginLink = vi.fn<NonNullable<Provider['createExpressLoginLink']>>()
    sourceMocks.callSourceQuery.mockResolvedValueOnce(obligationReadback)
      .mockResolvedValueOnce({ kind: 'conflict', code: 'multiple_businesses' })
    const runtime = connectRuntime(vi.fn())
    const provider = { ...runtime.provider!, createExpressLoginLink }
    expect(await createOwnerExpressLoginLinkThroughSource(
      { businessId: 'business-2', currency: 'USDC' }, {}, { ...runtime, provider },
    )).toEqual({ kind: 'refused', code: 'payout_not_ready', retryable: false })
    expect(await createOwnerExpressLoginLinkThroughSource(
      { businessId: 'business-1', currency: 'USDC' }, {}, { ...runtime, provider },
    )).toEqual({ kind: 'refused', code: 'payout_not_ready', retryable: false })
    expect(createExpressLoginLink).not.toHaveBeenCalled()
  })
})
