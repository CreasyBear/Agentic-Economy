import { describe, expect, it } from 'vitest'

import {
  createWorker,
  handler,
  invocationRef,
} from './capability-operation-worker-harness'

describe('capability operation invocation worker lease', () => {
  it('does not issue a buyer-owned provider lease for a brokered sandbox x402 call', async () => {
    const worker = createWorker('x402')

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).not.toContain('capabilityProviderConnections:issueLease')
    expect(paths).not.toContain('capabilityProviderConnections:consumeLease')
    expect(paths).not.toContain('capabilityProviderConnections:invalidateLease')
    expect(paths).not.toContain('capabilityProviderConnections:expireLease')
    expect(paths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
  })
})
