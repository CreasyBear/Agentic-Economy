import { describe, expect, it, vi } from 'vitest'

vi.mock('../formance/contracts', () => ({ financialEnvironmentMatches: () => true }))
vi.mock('../../../_generated/api', () => ({
  api: { moneyAccountFunding: { read: 'read' } },
  internal: {},
}))
const readCreditPayment = vi.fn()
vi.mock('../../../../src/lib/server/stripe-money-provider', () => ({
  createStripeMoneyProvider: () => ({ readCreditPayment }),
  readStripeMoneyReadbackProviderConfig: () => ({}),
  resolveStripeMoneyProviderContext: () => ({ client: {} }),
}))

import { fulfillReturnHandler } from './returnFulfillment'

describe('fulfillReturnHandler', () => {
  it('refuses a reversed command without reading the payment or applying an event', async () => {
    const runQuery = vi.fn().mockResolvedValue({
      kind: 'found', command: { state: 'reversed', environment: 'x', externalRef: 'r1' },
    })
    const runAction = vi.fn()
    const result = await fulfillReturnHandler({ runQuery, runAction, runMutation: vi.fn() } as never, { externalRef: 'r1' })
    expect(result).toEqual({ kind: 'refused', code: 'funding_reversed', retryable: false })
    expect(readCreditPayment).not.toHaveBeenCalled()
    expect(runAction).not.toHaveBeenCalled()
  })
})
