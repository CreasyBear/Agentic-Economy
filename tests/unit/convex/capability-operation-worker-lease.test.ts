import {
  attemptRef,
  createWorker,
  handler,
  invocationRef,
  mocks,
} from './capability-operation-worker-harness'
import { describe, expect, it } from 'vitest'

describe('capability operation invocation worker lease', () => {
  it('invalidates a provider-direct x402 lease before transport without AE money effects', async () => {
    const worker = createWorker('x402', { finalGrant: null })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.money).toBeUndefined()
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.mutationCalls.some(({ path }) => path.startsWith('moneyLedger:'))).toBe(false)
    expect(worker.state.mutationCalls).toContainEqual(expect.objectContaining({
      path: 'capabilityProviderConnections:invalidateLease',
      args: expect.objectContaining({ reasonCode: 'invocation_aborted' }),
    }))
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.payment.prepare).toBeUndefined()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'grant_generation_stale' },
    })
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
  })
  it('expires an overrun provider lease when post-release consumption reports lease_expired', async () => {
    const worker = createWorker('x402', {
      consumeLeaseResult: { kind: 'refused', code: 'lease_expired' },
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.mutationCalls).toContainEqual(expect.objectContaining({
      path: 'capabilityProviderConnections:consumeLease',
      args: expect.objectContaining({
        leaseRef: 'lease:test-worker',
        commandId: `operation-lease:${invocationRef}:${attemptRef}:1:consume`,
      }),
    }))
    expect(worker.state.mutationCalls).toContainEqual(expect.objectContaining({
      path: 'capabilityProviderConnections:expireLease',
      args: expect.objectContaining({
        leaseRef: 'lease:test-worker',
        commandId: `operation-lease:${invocationRef}:${attemptRef}:1:expire`,
      }),
    }))
    expect(worker.state.mutationCalls.some(({ path }) => path === 'capabilityProviderConnections:invalidateLease')).toBe(false)
  })

  it('invalidates a provider lease as invocation_aborted for a generic pre-release failure', async () => {
    const worker = createWorker('x402', { releaseFenceResult: { kind: 'refused' } })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.mutationCalls).toContainEqual(expect.objectContaining({
      path: 'capabilityProviderConnections:invalidateLease',
      args: expect.objectContaining({ reasonCode: 'invocation_aborted' }),
    }))
    expect(worker.state.mutationCalls.some(({ path, args }) => (
      path === 'capabilityProviderConnections:invalidateLease' && args.reasonCode === 'generation_changed'
    ))).toBe(false)
  })
})
