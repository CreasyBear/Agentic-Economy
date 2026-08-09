import { getFunctionName, type FunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CanonicalClaimCommand,
  CanonicalClaimSnapshot,
  CustomerRequestCanonicalClaimMaterial,
} from '@/modules/action-invocation'
import type {
  PreparedRouteTransportInvocation,
  RouteTransportFetch,
  RouteTransportInvocation,
  RouteTransportObservation,
  RouteTransportPreparation,
  RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'

type ConvexReference = FunctionReference<
  'query' | 'mutation' | 'action',
  'internal',
  Record<string, unknown>,
  unknown
>
type PrepareTransport = (
  invocation: RouteTransportInvocation,
  resolveCredential: RouteTransportRuntime['resolveCredential'],
  x402PaymentSigningAvailable?: RouteTransportRuntime['x402PaymentSigningAvailable'],
) => RouteTransportPreparation
type InvokeTransport = (
  prepared: PreparedRouteTransportInvocation,
  runtime: RouteTransportRuntime,
) => Promise<RouteTransportObservation>

const mocks = vi.hoisted(() => {
  const prepare = vi.fn<PrepareTransport>()
  const invoke = vi.fn<InvokeTransport>()
  const guardedFetch = vi.fn<RouteTransportFetch>()
  const signRouteTransportCall = vi.fn(() => ({ keyId: 'route-calls:test', signature: 'hmac-sha256:test' }))
  const createEvmX402PaymentSignature = vi.fn()
  const isPublicHttpTarget = vi.fn(async () => true)
  const createGuardedLookup = vi.fn(() => () => undefined)
  const agents: Array<{ close: () => Promise<undefined> }> = []
  class FakeAgent {
    close = vi.fn(async () => undefined)

    constructor() {
      agents.push(this)
    }
  }
  return {
    prepare,
    invoke,
    guardedFetch,
    signRouteTransportCall,
    createEvmX402PaymentSignature,
    isPublicHttpTarget,
    createGuardedLookup,
    FakeAgent,
    agents,
  }
})

vi.mock('@/modules/capability-supply/route-transport-runtime', () => ({
  prepareRegisteredRouteTransportInvocation: mocks.prepare,
  invokePreparedRouteTransport: mocks.invoke,
}))
vi.mock('@/modules/capability-supply/server', () => ({
  signRouteTransportCall: mocks.signRouteTransportCall,
  createEvmX402PaymentSignature: mocks.createEvmX402PaymentSignature,
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

const digest = (digit: string) => `sha256:${digit.repeat(64)}`
const recordedAt = '2026-08-09T00:00:00.000Z'
const dispatchRef = 'route-dispatch:dispatch:one'
const attemptRef = 'route-step-attempt:dispatch:one'
const invocationRef = 'action-invocation:customer-request-route-dispatch:dispatch:one'

function canonicalMaterial(): CustomerRequestCanonicalClaimMaterial {
  return {
    invocationRef,
    sourceRef: 'dispatch:one',
    invocationVersion: 1,
    actor: {
      callerRef: 'runtime:customer-request-route-dispatch',
      principalRef: 'principal:one',
    },
    origin: { kind: 'request_owned', requestRef: 'request:one', revision: 3 },
    action: { id: 'route.action.dispatch', contractVersion: '2' },
    materialInputDigest: digest('1'),
    authority: {
      reference: 'grant:one',
      decisionDigest: digest('2'),
      targetDigest: digest('3'),
      consequence: 'customer_request_route_dispatch:one',
      limits: { amount: { currency: 'AUD', units: '700', exponent: 2 } },
      expiresAt: '2099-01-01T00:00:00.000Z',
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
      leaseOwner: 'customer-request-route-dispatch:dispatch:one',
      leaseExpiresAt: '2099-01-01T00:00:30.000Z',
    },
    recordedAt,
  }
}

function openedDispatch() {
  return {
    kind: 'available',
    invocation: {
      dispatchRef,
      attemptRef,
      runRef: 'route-run:one',
      operationKeyDigest: digest('7'),
      inputJson: '{"city":"Perth"}',
      inputDigest: digest('1'),
      binding: {
        adapterId: 'http-json:v1',
        endpointUrl: 'https://provider.example.test/capability',
        authority: { kind: 'keyless' },
        configJson: JSON.stringify({ method: 'POST', requestTimeoutMs: 5_000 }),
        configDigest: digest('8'),
      },
      authority: {
        mandateDigest: digest('4'),
        grantDigest: digest('6'),
        capabilityContractDigest: digest('9'),
        maximumSpend: { currency: 'AUD', units: '700', exponent: 2 },
        expiresAt: Date.parse('2099-01-01T00:00:00.000Z'),
      },
      canonical: canonicalMaterial(),
    },
  }
}

type ProviderMode = 'succeeded' | 'unknown' | 'throw'
type WorkerOptions = Readonly<{
  refuseRelease?: boolean
  providerMode?: ProviderMode
}>

type DurableState = {
  snapshot: CanonicalClaimSnapshot | undefined
  events: string[]
  projectionCalls: number
}

type QueryArgs = Readonly<{
  dispatchRef?: string
  invocationRef?: string
  attemptRef?: string
}>
type MarkDispatchedArgs = Readonly<{ dispatchRef: string; attemptRef: string }>
type RecordNotReleasedArgs = Readonly<MarkDispatchedArgs & { observationJson: string }>
type RecordOutcomeArgs = Readonly<{
  attemptRef: string
  operationKeyDigest: string
  observationJson: string
  outcome:
    | Readonly<{ kind: 'succeeded'; outputJson: string }>
    | Readonly<{ kind: 'partial'; outputJson: string }>
    | Readonly<{ kind: 'failed' }>
    | Readonly<{ kind: 'unknown' }>
}>
type MutationArgs =
  | CanonicalClaimCommand
  | MarkDispatchedArgs
  | RecordNotReleasedArgs
  | RecordOutcomeArgs
type RunQuery = (reference: ConvexReference, args: QueryArgs) => Promise<unknown>
type RunMutation = (reference: ConvexReference, args: MutationArgs) => Promise<unknown>
type WorkerContext = Readonly<{ runQuery: RunQuery; runMutation: RunMutation }>
type WorkerHandler = (ctx: unknown, args: { dispatchRef: string }) => Promise<unknown>
type WorkerRegistration = WorkerHandler & Readonly<{ _handler: WorkerHandler }>
type Worker = Readonly<{
  ctx: WorkerContext
  state: DurableState
  handler: WorkerHandler
}>

function functionPath(reference: ConvexReference): string {
  return getFunctionName(reference)
}

function isCanonicalCommand(args: MutationArgs): args is CanonicalClaimCommand {
  return 'history' in args
}

function isWorkerRegistration(value: unknown): value is WorkerRegistration {
  if (typeof value !== 'function' || !('_handler' in value)) return false
  return typeof value._handler === 'function'
}

function createWorker(options: WorkerOptions): Worker {
  const state: DurableState = { snapshot: undefined, events: [], projectionCalls: 0 }
  const providerMode = options.providerMode ?? 'succeeded'

  mocks.prepare.mockReset()
  mocks.prepare.mockImplementation((invocation) => ({
    kind: 'prepared',
    prepared: {
      invocation,
      endpoint: new URL('https://provider.example.test/capability'),
      configuration: { method: 'POST', requestTimeoutMs: 5_000 },
      requestDigest: digest('b'),
      target: new URL('https://provider.example.test/capability'),
    },
  }))
  mocks.invoke.mockReset()
  mocks.invoke.mockImplementation(async (_prepared, runtime) => {
    state.events.push('provider:transport')
    await runtime.send(new URL('https://provider.example.test/capability'), {
      method: 'POST',
      body: '{"city":"Perth"}',
    })
    if (providerMode === 'throw') throw new Error('provider_transport_failed')
    if (providerMode === 'unknown') {
      return {
        transport: 'http',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: digest('b'),
        failureCode: 'provider_http_503',
      }
    }
    return {
      transport: 'http',
      disposition: 'succeeded',
      releaseStarted: true,
      requestDigest: digest('b'),
      responseDigest: digest('c'),
      outputJson: '{"ok":true}',
    }
  })
  mocks.guardedFetch.mockReset()
  mocks.guardedFetch.mockImplementation(async () => {
    state.events.push('provider:network')
    return new Response(null, { status: 200 })
  })

  const runQuery = vi.fn<RunQuery>(async (reference) => {
    switch (functionPath(reference)) {
      case 'customerRequestRouteExecution:openDispatch': return openedDispatch()
      case 'actionInvocationControl:readControl': return state.snapshot?.control
      case 'actionInvocationControl:readAttempt': return state.snapshot?.attempt
      default: throw new Error(`unexpected_query:${functionPath(reference)}`)
    }
  })
  const runMutation = vi.fn<RunMutation>(async (reference, args) => {
    switch (functionPath(reference)) {
      case 'actionInvocationControl:transact': {
        if (!isCanonicalCommand(args)) throw new Error('unexpected_canonical_command_shape')
        if (args.history.kind === 'claim_before_effect') {
          if (state.snapshot !== undefined) {
            state.events.push('duplicate:claim_before_effect')
            return { kind: 'duplicate', invocationVersion: state.snapshot.control.invocationVersion }
          }
          if (args.currentAttemptWrite === undefined) throw new Error('claim_attempt_missing')
          state.snapshot = { control: args.row, attempt: args.currentAttemptWrite }
          state.events.push('persist:claim_before_effect')
          return { kind: 'applied', invocationVersion: args.row.invocationVersion }
        }
        if (args.history.kind === 'release_fence_before_network' && options.refuseRelease === true) {
          state.events.push('refused:release_fence_before_network')
          return { kind: 'refused', code: 'reconciliation_required' }
        }
        if (args.currentAttemptWrite === undefined) throw new Error('transition_attempt_missing')
        state.snapshot = { control: args.row, attempt: args.currentAttemptWrite }
        state.events.push(`persist:${args.history.kind}`)
        return { kind: 'applied', invocationVersion: args.row.invocationVersion }
      }
      case 'customerRequestRouteExecution:markDispatched':
        state.events.push('persist:markDispatched')
        return { kind: 'recorded' }
      case 'customerRequestRouteExecution:recordNotReleased':
        state.events.push('projection:recordNotReleased')
        return null
      case 'customerRequestRouteExecution:recordOutcome':
        state.projectionCalls += 1
        state.events.push('projection:recordOutcome')
        return null
      default: throw new Error(`unexpected_mutation:${functionPath(reference)}`)
    }
  })
  const ctx: WorkerContext = { runQuery, runMutation }
  const registration: unknown = run
  if (!isWorkerRegistration(registration)) throw new Error('dispatch_worker_handler_missing')
  return { ctx, state, handler: registration._handler }
}

describe('customer request dispatch canonical worker seam', () => {
  beforeEach(() => {
    mocks.signRouteTransportCall.mockClear()
    mocks.isPublicHttpTarget.mockClear()
    mocks.createGuardedLookup.mockClear()
    mocks.agents.length = 0
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
  })

  it('persists claim and release fence before dispatch and provider I/O, then terminal before projection and replay does no I/O', async () => {
    const worker = createWorker({})

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({
      kind: 'completed', disposition: 'succeeded',
    })
    expect(worker.state.events).toEqual([
      'persist:claim_before_effect',
      'persist:release_fence_before_network',
      'persist:markDispatched',
      'provider:transport',
      'provider:network',
      'persist:terminal_returned',
      'projection:recordOutcome',
    ])
    expect(worker.state.projectionCalls).toBe(1)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.guardedFetch).toHaveBeenCalledTimes(1)
    expect(mocks.signRouteTransportCall).toHaveBeenCalledTimes(1)
    expect(mocks.agents).toHaveLength(1)
    expect(mocks.agents[0]?.close).toHaveBeenCalledTimes(1)
    expect(worker.state.snapshot?.attempt.outcome).toMatchObject({ state: 'returned' })

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({ kind: 'none' })
    expect(worker.state.events).toEqual([
      'persist:claim_before_effect',
      'persist:release_fence_before_network',
      'persist:markDispatched',
      'provider:transport',
      'provider:network',
      'persist:terminal_returned',
      'projection:recordOutcome',
      'duplicate:claim_before_effect',
    ])
    expect(worker.state.projectionCalls).toBe(1)
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.guardedFetch).toHaveBeenCalledTimes(1)
    expect(mocks.agents).toHaveLength(1)
  })

  it('refuses before markDispatched and provider I/O when the release fence is not durable', async () => {
    const worker = createWorker({ refuseRelease: true })

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({ kind: 'refused' })
    expect(worker.state.events).toEqual([
      'persist:claim_before_effect',
      'refused:release_fence_before_network',
    ])
    expect(worker.state.snapshot?.attempt.release).toMatchObject({ state: 'not_released' })
    expect(worker.state.events).not.toContain('persist:markDispatched')
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.projectionCalls).toBe(0)
    expect(mocks.agents).toHaveLength(0)
  })

  const postFenceFailures: readonly Readonly<{
    label: string
    mode: ProviderMode
  }>[] = [
    { label: 'an unknown provider observation', mode: 'unknown' },
    { label: 'a thrown provider transport', mode: 'throw' },
  ]

  it.each(postFenceFailures)('$label persists uncertain reconciliation before projection and replay', async ({ mode }) => {
    const worker = createWorker({ providerMode: mode })

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({
      kind: 'completed', disposition: 'unknown',
    })
    expect(worker.state.events).toEqual([
      'persist:claim_before_effect',
      'persist:release_fence_before_network',
      'persist:markDispatched',
      'provider:transport',
      'provider:network',
      'persist:terminal_uncertain',
      'projection:recordOutcome',
    ])
    expect(worker.state.snapshot?.attempt.outcome).toMatchObject({
      state: 'uncertain', retry: 'reconcile_before_retry',
    })
    expect(worker.state.projectionCalls).toBe(1)
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.guardedFetch).toHaveBeenCalledTimes(1)

    await expect(worker.handler(worker.ctx, { dispatchRef })).resolves.toEqual({ kind: 'none' })
    expect(worker.state.projectionCalls).toBe(1)
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.guardedFetch).toHaveBeenCalledTimes(1)
    expect(worker.state.events.at(-1)).toBe('duplicate:claim_before_effect')
  })
})
