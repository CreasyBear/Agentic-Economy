import {
  createWorker,
  attemptRef,
  digest,
  handler,
  invocationRef,
  mocks,
} from './capability-call-worker-harness'
import { describe, expect, it, vi } from 'vitest'
import { internal } from '../../../convex/_generated/api'

describe('capability operation invocation worker run', () => {
  it.each(['principal', 'reserved Tool', 'current Tool'] as const)(
    'refuses a production %s in hosted alpha before provider or custody effects', async (boundary) => {
      vi.stubEnv('AE_SERVICE_MODE', 'hosted_alpha')
      try {
        const production = createWorker('http', { environment: 'production' })
        const worker = boundary === 'principal' ? production : createWorker('http', {
          ...(boundary === 'current Tool' ? { currentTool: () => production.state.operation } : {}),
        })
        if (boundary === 'reserved Tool') worker.state.dispatch.toolJson = JSON.stringify(production.state.operation)
        await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
        expect(worker.state.records.at(-1)).toMatchObject({
          state: 'refused', result: { kind: 'refused', code: 'environment_mismatch' },
        })
        expect(worker.state.transportCalls).toBe(0)
        expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
        expect(mocks.invokeProviderConsequenceViaVercel).not.toHaveBeenCalled()
        expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
        expect(worker.state.mutationCalls.filter(({ path }) => path === 'capabilityCalls:claimDispatch')).toHaveLength(0)
      } finally { vi.unstubAllEnvs() }
    },
  )

  it('completes a sandbox Tool in hosted alpha', async () => {
    vi.stubEnv('AE_SERVICE_MODE', 'hosted_alpha')
    try {
      const worker = createWorker('http', { priceUnits: '0' })
      await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
      expect(worker.state.records.at(-1)).toMatchObject({ state: 'completed' })
      expect(worker.state.transportCalls).toBe(1)
    } finally { vi.unstubAllEnvs() }
  })

  it('preserves recovery of a possibly released production Call in hosted alpha', async () => {
    const worker = createWorker('http', { environment: 'production', alreadyLeased: true })
    const runQuery = worker.ctx.runQuery as (reference: unknown, args: unknown) => Promise<unknown>
    const control = await runQuery(internal.actionExecutionControl.readControl, { executionRef: invocationRef }) as {
      control: { control: { release: string } }
    }
    const attempt = await runQuery(internal.actionExecutionControl.readAttempt, {
      executionRef: invocationRef, attemptRef,
    }) as { release: { state: string } }
    control.control.control.release = 'possibly_released'
    attempt.release.state = 'possibly_released'
    vi.stubEnv('AE_SERVICE_MODE', 'hosted_alpha')
    try {
      await handler(worker.ctx, { callRef: invocationRef })
      expect(worker.state.records.some(record => record.state === 'refused')).toBe(false)
      expect(worker.state.dispatch.dispatchState).toBe('reconciliation_required')
      expect(worker.state.transportCalls).toBe(0)
      expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })

  it('refuses when the current readiness commitment changed after admission', async () => {
    const worker = createWorker('http', {
      currentTool: (operation) => ({
        ...operation,
        readiness: {
          ...operation.readiness,
          observedAt: operation.readiness.observedAt + 1_000,
          qualificationDigest: digest('q'),
        },
      }),
    })
    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'operation_not_current' },
    })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'capabilityCalls:claimDispatch')).toHaveLength(0)
    expect(mocks.claimCanonicalExecution).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
  })

  it('refuses currentDigest drift immediately before the provider effect', async () => {
    const worker = createWorker('http', {
      releaseCurrentOperation: (operation) => ({
        ...operation,
        readiness: {
          ...operation.readiness,
          validUntil: operation.readiness.validUntil + 1_000,
        },
      }),
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.events).toContain('current-publication-price-revalidation')
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'pre_release_failed' },
    })
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
  })

  it('ignores a refused claim when another worker owns the active lease', async () => {
    const activeCharge = {
      state: 'reserved',
      transactionRef: `operation-money:${invocationRef}:${digest('w')}`,
    }
    const worker = createWorker('http', {
      claimDispatchRefused: true,
      activeCharge,
    })
    const dispatchBefore = structuredClone(worker.state.dispatch)
    const chargeBefore = structuredClone(worker.state.money)

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'none' })

    expect(worker.state.dispatch).toEqual(dispatchBefore)
    expect(worker.state.money).toEqual(chargeBefore)
    expect(worker.state.records).toHaveLength(0)
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.qualifiedUse).toHaveLength(0)
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.mutationCalls.map(({ path }) => path)).toEqual([
      'capabilityCalls:reconcileCallWorkloadAuthority',
      'capabilityCalls:claimDispatch',
    ])
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })

  it('refuses changed operation material before claim or transport', async () => {
    const worker = createWorker('http', {
      currentTool: (operation) => ({
        ...operation,
        operationId: `${operation.operationId}:changed`,
        materialDigest: digest('m'),
        identity: {
          ...operation.identity,
          publicationRef: `${operation.identity.publicationRef}:changed`,
        },
      }),
    })
    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'operation_not_current' },
    })
    expect(mocks.claimCanonicalExecution).not.toHaveBeenCalled()
    expect(mocks.prepareRegisteredRouteTransportInvocation).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
  })
  it('refuses failed route-call signing before money or provider I/O', async () => {
    mocks.signRouteTransportCall.mockReturnValueOnce(undefined)
    const worker = createWorker('http')

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(0)
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused', code: 'pre_release_failed', retryable: false },
    })
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
  })

  it('refuses a non-public prepared endpoint before money or provider I/O', async () => {
    mocks.isPublicHttpTarget.mockResolvedValueOnce(false)
    const worker = createWorker('http')

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(mocks.prepareRegisteredRouteTransportInvocation).toHaveBeenCalledTimes(1)
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(0)
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused', code: 'pre_release_failed', retryable: false },
    })
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
  })
})
