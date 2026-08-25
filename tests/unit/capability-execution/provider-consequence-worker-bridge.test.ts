import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWorker,
  handler,
  invocationRef,
  mocks,
} from '../convex/capability-operation-worker-harness'

describe('provider consequence worker bridge', () => {
  beforeEach(() => {
    vi.stubEnv('AE_X402_PAYMENT_CREDENTIAL_REF', '')
  })

  it('preserves sandbox provider-direct x402 commercial outcomes without an env signer or custody fields', async () => {
    const worker = createWorker('x402', { environment: 'sandbox' })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(mocks.invokeProviderConsequenceViaVercel).toHaveBeenCalledOnce()
    expect(mocks.x402PaymentCredentialRefFromEnvironment).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(1)
    const reserve = worker.state.mutationCalls.find(
      ({ path }) => path === 'moneyLedger:reserveExternalInvocationSpend',
    )
    expect(reserve?.args).toMatchObject({
      invocationRef,
      environment: 'sandbox',
      amount: { currency: 'USD', units: '1', exponent: 2 },
    })
    expect(reserve?.args).not.toHaveProperty('custodyRef')
    expect(reserve?.args).not.toHaveProperty('custodyGeneration')
    expect(reserve?.args).not.toHaveProperty('custodyDailyMaximum')
    expect(worker.state.mutationCalls).toContainEqual(expect.objectContaining({
      path: 'moneyLedger:finalizeExternalInvocationSpend',
      args: expect.objectContaining({
        submissionStatus: 'observed',
        settlementStatus: 'settled',
      }),
    }))
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'completed',
      dispatchState: 'completed',
    })
  })
})
