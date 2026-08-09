import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const cancellation = vi.fn()
  const signRouteTransportCall = vi.fn(() => ({ keyId: 'route-calls:test', signature: 'hmac-sha256:test' }))
  const isPublicHttpTarget = vi.fn(async () => true)
  const createGuardedLookup = vi.fn(() => () => undefined)
  class FakeAgent {
    close = vi.fn(async () => undefined)
  }
  return { cancellation, signRouteTransportCall, isPublicHttpTarget, createGuardedLookup, FakeAgent }
})

vi.mock('@/modules/capability-supply/route-transport-runtime', () => ({
  invokeRegisteredRouteCancellation: mocks.cancellation,
}))
vi.mock('@/modules/capability-supply/server', () => ({
  signRouteTransportCall: mocks.signRouteTransportCall,
}))
vi.mock('@/modules/network-guard/public', () => ({
  createGuardedLookup: mocks.createGuardedLookup,
  defaultDnsResolver: { lookup: vi.fn() },
  isPublicHttpTarget: mocks.isPublicHttpTarget,
}))
vi.mock('undici', () => ({
  Agent: mocks.FakeAgent,
  fetch: vi.fn(),
}))

import { run } from '../../../../convex/customerRequestRouteCancellationWorker'
import type { CustomerRequestCanonicalClaimMaterial } from '@/modules/action-invocation'

const digest = (digit: string) => `sha256:${digit.repeat(64)}`
const recordedAt = '2026-08-09T00:00:00.000Z'
const invocationRef = 'action-invocation:customer-request-route-cancellation:cancel:one'
const attemptRef = 'action-attempt:customer-request-route-cancellation:cancel:one'

type DurableState = {
  control: Record<string, unknown> | undefined
  attempt: Record<string, unknown> | undefined
  events: string[]
  projectionCalls: number
  commandDigests: Map<string, string>
}

type WorkerOptions = Readonly<{ refuseRelease?: boolean }>

function canonicalMaterial(): CustomerRequestCanonicalClaimMaterial {
  return {
    invocationRef,
    sourceRef: 'cancel:one',
    invocationVersion: 1,
    actor: {
      callerRef: 'runtime:customer-request-route-cancellation',
      principalRef: 'principal:one',
    },
    origin: { kind: 'request_owned', requestRef: 'request:one', revision: 3 },
    action: { id: 'route.action.cancel', contractVersion: '2' },
    materialInputDigest: digest('1'),
    authority: {
      reference: 'grant:one',
      decisionDigest: digest('2'),
      targetDigest: digest('3'),
      consequence: 'customer_request_route_cancellation:one',
      limits: { amount: { currency: 'AUD', units: '700', exponent: 2 } },
      expiresAt: '2026-08-10T00:00:00.000Z',
      acceptedBasis: {
        kind: 'customer_request_mandate_use',
        mandateRef: 'mandate:one',
        mandateDigest: digest('4'),
        requestRevision: 3,
        routeGeneration: 2,
        authorization: {
          kind: 'explicit',
          authorizationEvidenceRef: 'authorization:one',
          authorizationEvidenceDigest: digest('5'),
        },
        grantRef: 'grant:one',
        grantDigest: digest('6'),
      },
    },
    attempt: {
      attemptRef,
      attemptNumber: 1,
      effectGeneration: 1,
      operationKey: digest('7'),
      leaseOwner: 'customer-request-route-cancellation:cancel:one',
      leaseExpiresAt: '2026-08-09T00:00:30.000Z',
    },
    recordedAt,
  }
}

function openedCancellation(): Record<string, unknown> {
  return {
    kind: 'available',
    invocation: {
      cancellationRef: 'cancel:one',
      attemptRef: 'route-step-attempt:one',
      operationKeyDigest: digest('8'),
      binding: {
        adapterId: 'http-json:v1',
        endpointUrl: 'https://provider.example.test/capability',
        authority: { kind: 'keyless' },
        configJson: JSON.stringify({
          method: 'POST', requestTimeoutMs: 5_000,
          cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
        }),
        configDigest: digest('9'),
      },
      authority: {
        mandateDigest: digest('4'),
        grantDigest: digest('6'),
        capabilityContractDigest: digest('a'),
        maximumSpend: { currency: 'AUD', units: '700', exponent: 2 },
        expiresAt: Date.parse('2026-08-10T00:00:00.000Z'),
      },
      canonical: canonicalMaterial(),
    },
  }
}

function createWorker(options: WorkerOptions): {
  ctx: Record<string, unknown>
  state: DurableState
  handler: (ctx: unknown, args: { cancellationRef: string }) => Promise<null>
} {
  const state: DurableState = {
    control: undefined,
    attempt: undefined,
    events: [],
    projectionCalls: 0,
    commandDigests: new Map(),
  }
  const functionPath = (reference: unknown): string => (
    typeof reference === 'string' ? reference : getFunctionName(reference as never)
  )
  const ctx = {
    runQuery: vi.fn(async (reference: unknown) => {
      switch (functionPath(reference)) {
        case 'customerRequestRouteExecution:openCancellationAttempt': return openedCancellation()
        case 'actionInvocationControl:readControl': return state.control
        case 'actionInvocationControl:readAttempt': return state.attempt
        default: throw new Error(`unexpected_query:${functionPath(reference)}`)
      }
    }),
    runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
      switch (functionPath(reference)) {
        case 'actionInvocationControl:transact': {
          const command = args as {
            commandId: string
            commandDigest: string
            row: Record<string, unknown>
            currentAttemptWrite?: Record<string, unknown>
            history: { kind: string }
          }
          const priorDigest = state.commandDigests.get(command.commandId)
          if (priorDigest !== undefined) {
            return priorDigest === command.commandDigest
              ? { kind: 'duplicate', invocationVersion: state.control?.invocationVersion }
              : { kind: 'refused', code: 'command_identity_conflict' }
          }
          if (command.history.kind === 'release_fence_before_network' && options.refuseRelease === true) {
            state.events.push('refused:release_fence_before_network')
            return { kind: 'refused', code: 'reconciliation_required' }
          }
          state.commandDigests.set(command.commandId, command.commandDigest)
          state.control = command.row
          state.attempt = command.currentAttemptWrite
          state.events.push(`persist:${command.history.kind}`)
          return { kind: 'applied', invocationVersion: command.row.invocationVersion }
        }
        case 'customerRequestRouteExecution:resolveCancellationAttempt':
          state.projectionCalls += 1
          return null
        default: throw new Error(`unexpected_mutation:${functionPath(reference)}`)
      }
    }),
  }
  const workerRegistration = run as unknown as {
    _handler: (ctx: unknown, args: { cancellationRef: string }) => Promise<null>
  }
  return { ctx, state, handler: workerRegistration._handler }
}

describe('customer request cancellation canonical worker seam', () => {
  beforeEach(() => {
    mocks.cancellation.mockReset()
    mocks.signRouteTransportCall.mockClear()
    mocks.isPublicHttpTarget.mockClear()
    mocks.createGuardedLookup.mockClear()
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
  })

  it('persists claim and release fence before provider I/O, then converges terminal result and replays without I/O', async () => {
    const worker = createWorker({})
    mocks.cancellation.mockImplementation(async () => {
      worker.state.events.push('provider:cancellation')
      return {
        disposition: 'accepted', requestDigest: digest('b'), responseDigest: digest('c'),
        providerReference: 'provider:cancelled',
      }
    })

    await expect(worker.handler(worker.ctx, { cancellationRef: 'cancel:one' })).resolves.toBeNull()
    expect(worker.state.events).toEqual([
      'persist:claim_before_effect', 'persist:release_fence_before_network', 'provider:cancellation', 'persist:terminal_returned',
    ])
    expect(worker.state.projectionCalls).toBe(1)
    expect(mocks.cancellation).toHaveBeenCalledTimes(1)
    expect(worker.state.control?.sourceResultRef).toMatch(/^route-cancellation-result:v1:sha256:/u)
    expect(JSON.stringify(worker.state.control)).not.toContain('provider:cancelled')

    await expect(worker.handler(worker.ctx, { cancellationRef: 'cancel:one' })).resolves.toBeNull()
    expect(mocks.cancellation).toHaveBeenCalledTimes(1)
    expect(worker.state.projectionCalls).toBe(1)
  })

  it('records signing failure as failed and not released without a release fence or provider I/O', async () => {
    const worker = createWorker({})
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', '')

    await expect(worker.handler(worker.ctx, { cancellationRef: 'cancel:one' })).resolves.toBeNull()
    expect(worker.state.events).toEqual([
      'persist:claim_before_effect',
      'persist:terminal_failed',
    ])
    expect(mocks.cancellation).not.toHaveBeenCalled()
    expect(worker.state.projectionCalls).toBe(1)
    const outcomeValue = worker.state.attempt?.outcome
    if (typeof outcomeValue !== 'object' || outcomeValue === null) {
      throw new Error('failed canonical outcome missing')
    }
    expect(outcomeValue).toMatchObject({ state: 'failed' })
    expect(worker.state.attempt?.release).toEqual({ state: 'not_released' })
  })

  it('persists uncertain terminal state and refuses every replay without another provider call', async () => {
    const worker = createWorker({})
    mocks.cancellation.mockResolvedValue({
      disposition: 'unknown', requestDigest: digest('d'), failureCode: 'provider_http_503',
    })

    await expect(worker.handler(worker.ctx, { cancellationRef: 'cancel:one' })).resolves.toBeNull()
    expect(worker.state.events).toEqual([
      'persist:claim_before_effect', 'persist:release_fence_before_network', 'persist:terminal_uncertain',
    ])
    const outcomeValue = worker.state.attempt?.outcome
    if (typeof outcomeValue !== 'object' || outcomeValue === null || !('errorDigest' in outcomeValue)) {
      throw new Error('uncertain canonical outcome missing')
    }
    expect(outcomeValue).toMatchObject({ state: 'uncertain', retry: 'reconcile_before_retry' })
    expect(outcomeValue.errorDigest).toMatch(/^sha256:/u)
    expect(mocks.cancellation).toHaveBeenCalledTimes(1)

    await expect(worker.handler(worker.ctx, { cancellationRef: 'cancel:one' })).resolves.toBeNull()
    expect(mocks.cancellation).toHaveBeenCalledTimes(1)
    expect(worker.state.projectionCalls).toBe(1)
  })

  it('refuses provider I/O when the release fence cannot be durably persisted', async () => {
    const worker = createWorker({ refuseRelease: true })

    await expect(worker.handler(worker.ctx, { cancellationRef: 'cancel:one' })).resolves.toBeNull()
    expect(worker.state.events).toEqual(['persist:claim_before_effect', 'refused:release_fence_before_network'])
    expect(mocks.cancellation).not.toHaveBeenCalled()
    expect(worker.state.projectionCalls).toBe(0)
  })
})
