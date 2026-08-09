import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const claimCanonicalInvocation = vi.fn()
  const persistCanonicalReleaseFence = vi.fn()
  const persistCanonicalTerminalOutcome = vi.fn()
  const prepareRegisteredRouteTransportInvocation = vi.fn()
  const invokePreparedRouteTransport = vi.fn()
  const signRouteTransportCall = vi.fn(() => ({ keyId: 'route-calls:test', signature: 'hmac-sha256:test' }))
  const isPublicHttpTarget = vi.fn()
  const createGuardedLookup = vi.fn()
  const guardedFetch = vi.fn()
  class FakeAgent {
    close = vi.fn(async () => undefined)
  }
  return {
    claimCanonicalInvocation,
    persistCanonicalReleaseFence,
    persistCanonicalTerminalOutcome,
    prepareRegisteredRouteTransportInvocation,
    invokePreparedRouteTransport,
    signRouteTransportCall,
    isPublicHttpTarget,
    createGuardedLookup,
    guardedFetch,
    FakeAgent,
  }
})

vi.mock('@/modules/action-invocation', () => ({
  claimCanonicalInvocation: mocks.claimCanonicalInvocation,
  persistCanonicalReleaseFence: mocks.persistCanonicalReleaseFence,
  persistCanonicalTerminalOutcome: mocks.persistCanonicalTerminalOutcome,
}))
vi.mock('@/modules/capability-supply/route-transport-runtime', () => ({
  prepareRegisteredRouteTransportInvocation: mocks.prepareRegisteredRouteTransportInvocation,
  invokePreparedRouteTransport: mocks.invokePreparedRouteTransport,
}))
vi.mock('@/modules/capability-supply/server', () => ({
  signRouteTransportCall: mocks.signRouteTransportCall,
  createEvmX402PaymentSignature: vi.fn(),
}))
vi.mock('@/modules/network-guard/public', () => ({
  createGuardedLookup: mocks.createGuardedLookup,
  defaultDnsResolver: { lookup: vi.fn() },
  isPublicHttpTarget: mocks.isPublicHttpTarget,
}))
vi.mock('undici', () => ({
  Agent: mocks.FakeAgent,
  fetch: mocks.guardedFetch,
}))

import { run } from '../../../../convex/customerRequestRouteTransportWorker'
import type { CustomerRequestCanonicalClaimMaterial } from '@/modules/action-invocation'
import type { RouteTransportObservation, X402RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'

const digest = (digit: string) => `sha256:${digit.repeat(64)}`
const recordedAt = '2026-08-09T00:00:00.000Z'
const dispatchRef = 'dispatch:route:one'
const invocationRef = 'action-invocation:customer-request-route:one'
const attemptRef = 'action-attempt:customer-request-route:one'
const providerRef = 'provider:one'
const providerCredentialRef = 'env:AE_TEST_PROVIDER_CREDENTIAL'

type ClaimMode = 'claimed' | 'active' | 'terminal_replay' | 'refused'
type BindingKind = 'http-json:v1' | 'x402-fetch:v2'
type WorkerOptions = Readonly<{
  claimMode?: ClaimMode
  bindingKind?: BindingKind
  publicTarget?: boolean
  refuseReleaseFence?: boolean
  observation?: RouteTransportObservation
  exerciseX402?: boolean
}>

type WorkerState = {
  events: string[]
  control: Record<string, unknown>
  attempt: Record<string, unknown>
  terminalInput: Record<string, unknown> | undefined
  routeOutcome: Record<string, unknown> | undefined
  routeRefusal: Record<string, unknown> | undefined
  x402: {
    prepare: number[]
    mark: number[]
    observe: number[]
  }
}

function canonicalMaterial(effectGeneration = 7): CustomerRequestCanonicalClaimMaterial {
  return {
    invocationRef,
    sourceRef: 'route:one',
    invocationVersion: 1,
    actor: {
      callerRef: 'runtime:customer-request-route',
      principalRef: 'principal:one',
    },
    origin: { kind: 'request_owned', requestRef: 'request:one', revision: 3 },
    action: { id: 'route.action.execute', contractVersion: '2' },
    materialInputDigest: digest('1'),
    authority: {
      reference: 'grant:one',
      decisionDigest: digest('2'),
      targetDigest: digest('3'),
      consequence: 'customer_request_route:one',
      limits: { amount: { currency: 'USD', units: '700', exponent: 2 } },
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
      effectGeneration,
      operationKey: digest('7'),
      leaseOwner: 'customer-request-route:one',
      leaseExpiresAt: '2026-08-09T00:00:30.000Z',
    },
    recordedAt,
  }
}

function openedDispatch(options: WorkerOptions): Record<string, unknown> {
  const kind = options.bindingKind ?? 'http-json:v1'
  const authority = kind === 'x402-fetch:v2'
    ? { kind: 'provider_connection', connectionRef: 'connection:one', providerRef }
    : { kind: 'keyless' }
  return {
    kind: 'available',
    invocation: {
      dispatchRef,
      attemptRef: 'route-step-attempt:one',
      runRef: 'run:one',
      operationKeyDigest: digest('8'),
      inputJson: JSON.stringify({ city: 'Perth' }),
      inputDigest: digest('9'),
      binding: {
        adapterId: kind,
        endpointUrl: 'https://provider.example.test/capability',
        authority,
        ...(kind === 'x402-fetch:v2'
          ? {
              connectionAuthority: {
                connectionRef: 'connection:one',
                providerRef,
                adapterId: kind,
                authorityGeneration: 1,
                authorityDigest: digest('g'),
                operationRef: 'operation:one',
                grantedScopes: [],
                grantedResources: [],
              },
            }
          : {}),
        configJson: JSON.stringify({ method: 'POST', requestTimeoutMs: 5_000 }),
        configDigest: digest('a'),
      },
      authority: {
        mandateDigest: digest('2'),
        grantDigest: digest('6'),
        capabilityContractDigest: digest('b'),
        maximumSpend: { currency: 'USD', units: '700', exponent: 2 },
        expiresAt: Date.parse('2026-08-10T00:00:00.000Z'),
      },
      canonical: canonicalMaterial(),
    },
  }
}

function successfulObservation(options: WorkerOptions): RouteTransportObservation {
  return options.observation ?? {
    transport: options.bindingKind === 'x402-fetch:v2' ? 'x402' : 'http',
    disposition: 'succeeded',
    releaseStarted: true,
    requestDigest: digest('c'),
    responseDigest: digest('d'),
    outputJson: JSON.stringify({ raw: 'provider-output' }),
  }
}

function x402Request(effectGeneration: number) {
  const selectedRequirement = {
    scheme: 'exact' as const,
    network: 'eip155:1' as const,
    amount: '1',
    asset: '0x0000000000000000000000000000000000000001',
    payTo: '0x0000000000000000000000000000000000000002',
    maxTimeoutSeconds: 60,
    extra: {},
  }
  const challenge = {
    x402Version: 2 as const,
    resource: { url: 'https://provider.example.test/capability' },
    accepts: [selectedRequirement],
  }
  return {
    challenge,
    credential: 'provider-credential',
    paymentIdentifier: 'payment:one',
    selectedRequirement,
    challengeDigest: digest('e'),
    attemptRef,
    effectGeneration,
    paymentAmount: { currency: 'USD', units: '1', exponent: 2 },
  }
}

function createWorker(options: WorkerOptions = {}): {
  ctx: Record<string, unknown>
  state: WorkerState
  handler: (ctx: unknown, args: { dispatchRef: string }) => Promise<unknown>
} {
  const canonical = canonicalMaterial()
  const state: WorkerState = {
    events: [],
    control: { currentAttemptRef: canonical.attempt.attemptRef },
    attempt: { attemptRef: canonical.attempt.attemptRef, effectGeneration: canonical.attempt.effectGeneration },
    terminalInput: undefined,
    routeOutcome: undefined,
    routeRefusal: undefined,
    x402: { prepare: [], mark: [], observe: [] },
  }
  const functionPath = (reference: unknown): string => (
    typeof reference === 'string' ? reference : getFunctionName(reference as never)
  )

  mocks.claimCanonicalInvocation.mockImplementation(async () => {
    state.events.push('canonical:claim')
    if (options.claimMode === 'active') return { kind: 'active', snapshot: {} }
    if (options.claimMode === 'terminal_replay') return { kind: 'terminal_replay', snapshot: {} }
    if (options.claimMode === 'refused') return { kind: 'refused', code: 'stale_invocation_version' }
    return {
      kind: 'claimed', invocationRef, attemptRef: canonical.attempt.attemptRef,
      invocationVersion: 1, effectGeneration: canonical.attempt.effectGeneration,
    }
  })
  mocks.persistCanonicalReleaseFence.mockImplementation(async () => {
    state.events.push('canonical:release_fence')
    return options.refuseReleaseFence === true
      ? { kind: 'refused', code: 'reconciliation_required' }
      : { kind: 'applied', invocationVersion: 2 }
  })
  mocks.persistCanonicalTerminalOutcome.mockImplementation(async (input: { outcome: Record<string, unknown> }) => {
    state.events.push(`canonical:terminal:${String(input.outcome.kind)}`)
    state.terminalInput = input as unknown as Record<string, unknown>
    return { kind: 'applied', invocationVersion: 3 }
  })
  mocks.prepareRegisteredRouteTransportInvocation.mockImplementation((invocation: Record<string, unknown>) => ({
    kind: 'prepared',
    prepared: { invocation, endpoint: new URL('https://provider.example.test/capability') },
  }))
  mocks.isPublicHttpTarget.mockImplementation(async () => {
    state.events.push('dns:public-target')
    return options.publicTarget !== false
  })
  mocks.createGuardedLookup.mockImplementation(() => {
    state.events.push('dns:lookup')
    return () => undefined
  })
  mocks.guardedFetch.mockImplementation(async (_input: unknown, init: Record<string, unknown> | undefined) => {
    state.events.push('provider:fetch')
    expect(init?.dispatcher).toBeDefined()
    return { ok: true, status: 200, text: async () => '{}' }
  })
  mocks.invokePreparedRouteTransport.mockImplementation(async (_prepared: unknown, runtimeValue: unknown) => {
    state.events.push('provider:invoke')
    const runtime = runtimeValue as X402RouteTransportRuntime
    await runtime.send(new URL('https://provider.example.test/capability'), { method: 'POST' })
    if (options.exerciseX402 === true) {
      const request = x402Request(999)
      await runtime.prepareX402PaymentAuthorization(request)
      const paymentEvent = {
        paymentIdentifier: request.paymentIdentifier,
        attemptRef,
        challengeDigest: request.challengeDigest,
        scheme: request.selectedRequirement.scheme,
        network: request.selectedRequirement.network,
        asset: request.selectedRequirement.asset,
        payTo: request.selectedRequirement.payTo,
        amount: request.paymentAmount,
        providerEndpoint: request.challenge.resource.url,
        custodyRef: 'custody:one',
        authorizationDigest: digest('f'),
        effectGeneration: 999,
      }
      const markX402PaymentPossiblySubmitted = runtime.markX402PaymentPossiblySubmitted
      const observeX402PaymentAttempt = runtime.observeX402PaymentAttempt
      if (markX402PaymentPossiblySubmitted === undefined || observeX402PaymentAttempt === undefined) {
        throw new Error('x402 payment callbacks missing')
      }
      await markX402PaymentPossiblySubmitted(paymentEvent)
      await observeX402PaymentAttempt({ ...paymentEvent, state: 'observed', evidenceRefs: ['evidence:one'] })
    }
    return successfulObservation(options)
  })

  const ctx = {
    runQuery: vi.fn(async (reference: unknown) => {
      switch (functionPath(reference)) {
        case 'customerRequestRouteExecution:openDispatch': return openedDispatch(options)
        case 'actionInvocationControl:readControl': return state.control
        case 'actionInvocationControl:readAttempt': return state.attempt
        case 'capabilityProviderConnections:read': return {
          providerRef,
          adapterId: 'x402-fetch:v2',
          authorityGeneration: 1,
          authorityDigest: digest('g'),
        }
        case 'capabilityProviderConnections:resolveCredentialRef': return {
          kind: 'resolved', credentialRef: providerCredentialRef,
        }
        default: throw new Error(`unexpected_query:${functionPath(reference)}`)
      }
    }),
    runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
      switch (functionPath(reference)) {
        case 'customerRequestRouteExecution:markDispatched':
          state.events.push('route:mark_dispatched')
          return { kind: 'recorded' }
        case 'customerRequestRouteExecution:recordNotReleased':
          state.events.push('route:refused_projection')
          state.routeRefusal = args
          return null
        case 'customerRequestRouteExecution:recordOutcome':
          state.events.push('route:outcome_projection')
          state.routeOutcome = args
          return null
        case 'customerRequestRouteExecution:prepareX402PaymentAuthorization':
          state.x402.prepare.push(Number(args.effectGeneration))
          return { custodyRef: 'custody:one', authorizationDigest: digest('f') }
        case 'customerRequestRouteExecution:markX402PaymentPossiblySubmitted':
          state.x402.mark.push(Number(args.effectGeneration))
          return null
        case 'customerRequestRouteExecution:observeX402PaymentAttempt':
          state.x402.observe.push(Number(args.effectGeneration))
          return null
        default: throw new Error(`unexpected_mutation:${functionPath(reference)}`)
      }
    }),
  }
  const workerRegistration = run as unknown as {
    _handler: (ctx: unknown, args: { dispatchRef: string }) => Promise<unknown>
  }
  return { ctx, state, handler: workerRegistration._handler }
}

describe('customer request route transport canonical worker seam', () => {
  beforeEach(() => {
    mocks.claimCanonicalInvocation.mockReset()
    mocks.persistCanonicalReleaseFence.mockReset()
    mocks.persistCanonicalTerminalOutcome.mockReset()
    mocks.prepareRegisteredRouteTransportInvocation.mockReset()
    mocks.invokePreparedRouteTransport.mockReset()
    mocks.signRouteTransportCall.mockClear()
    mocks.isPublicHttpTarget.mockReset()
    mocks.createGuardedLookup.mockReset()
    mocks.guardedFetch.mockReset()
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('AE_TEST_PROVIDER_CREDENTIAL', 'provider-credential')
  })

  it('orders claim, release fence, route mark, DNS, provider, canonical terminal, and projection', async () => {
    const worker = createWorker()

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({
      kind: 'completed', disposition: 'succeeded',
    })
    expect(worker.state.events).toEqual([
      'canonical:claim',
      'canonical:release_fence',
      'route:mark_dispatched',
      'dns:public-target',
      'dns:lookup',
      'provider:invoke',
      'provider:fetch',
      'canonical:terminal:returned',
      'route:outcome_projection',
    ])
    expect(mocks.invokePreparedRouteTransport).toHaveBeenCalledTimes(1)
    expect(worker.state.terminalInput).toBeDefined()
    expect(JSON.stringify(worker.state.terminalInput)).not.toContain('provider-output')
    expect(worker.state.terminalInput).toMatchObject({
      outcome: {
        kind: 'returned',
        resultRef: expect.stringMatching(/^route-result:v1:sha256:/u),
        resultDigest: expect.stringMatching(/^sha256:/u),
        resultReferenceable: false,
      },
    })
    expect(worker.state.routeOutcome).toMatchObject({
      outcome: { kind: 'succeeded', outputJson: JSON.stringify({ raw: 'provider-output' }) },
    })
  })

  it.each(['active', 'terminal_replay'] as const)('does not touch DNS/provider for a %s claim', async (claimMode) => {
    const worker = createWorker({ claimMode })

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({ kind: 'none' })
    expect(mocks.isPublicHttpTarget).not.toHaveBeenCalled()
    expect(mocks.createGuardedLookup).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.persistCanonicalReleaseFence).not.toHaveBeenCalled()
    expect(worker.state.events).toEqual(['canonical:claim'])
  })

  it('does not touch DNS/provider when the release fence is refused', async () => {
    const worker = createWorker({ refuseReleaseFence: true })

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({ kind: 'refused' })
    expect(worker.state.events).toEqual([
      'canonical:claim', 'canonical:release_fence',
    ])
    expect(mocks.createGuardedLookup).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.persistCanonicalTerminalOutcome).not.toHaveBeenCalled()
  })

  it('checks endpoint publicity only after the fence and records uncertainty before refused observation projection', async () => {
    const worker = createWorker({ publicTarget: false })

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({
      kind: 'completed', disposition: 'unknown',
    })
    expect(worker.state.events).toEqual([
      'canonical:claim',
      'canonical:release_fence',
      'route:mark_dispatched',
      'dns:public-target',
      'canonical:terminal:uncertain',
      'route:outcome_projection',
    ])
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.terminalInput).toMatchObject({
      outcome: { kind: 'uncertain', release: 'possibly_released' },
    })
    expect(worker.state.routeOutcome).toMatchObject({
      outcome: { kind: 'unknown' },
    })
    const refusal = JSON.parse(String(worker.state.routeOutcome?.observationJson)) as Record<string, unknown>
    expect(refusal).toMatchObject({
      disposition: 'refused', releaseStarted: true, failureCode: 'endpoint_not_public',
    })
  })

  it('maps a succeeded transport without output to uncertain canonical and route outcomes', async () => {
    const worker = createWorker({
      observation: {
        transport: 'http', disposition: 'succeeded', releaseStarted: true,
        requestDigest: digest('c'), responseDigest: digest('d'),
      },
    })

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({
      kind: 'completed', disposition: 'succeeded',
    })
    expect(worker.state.terminalInput).toMatchObject({
      outcome: { kind: 'uncertain', release: 'possibly_released' },
    })
    expect(worker.state.routeOutcome).toMatchObject({ outcome: { kind: 'unknown' } })
    expect(JSON.stringify(worker.state.terminalInput)).not.toContain('outputJson')
  })

  it('passes the canonical effect generation to every x402 persistence call, never zero', async () => {
    const worker = createWorker({ bindingKind: 'x402-fetch:v2', exerciseX402: true })

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({
      kind: 'completed', disposition: 'succeeded',
    })
    expect(worker.state.x402.prepare).toEqual([7])
    expect(worker.state.x402.mark).toEqual([7])
    expect(worker.state.x402.observe).toEqual([7])
    expect(worker.state.x402.mark).not.toContain(0)
    expect(worker.state.x402.observe).not.toContain(0)
  })
})
