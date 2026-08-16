import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
type ActionInvocationModule = Record<string, unknown>

const mocks = vi.hoisted(() => {
  const claimCanonicalInvocation = vi.fn()
  const persistCanonicalReleaseFence = vi.fn()
  const persistCanonicalTerminalOutcome = vi.fn()
  const prepareRegisteredRouteTransportInvocation = vi.fn()
  const invokePreparedRouteTransport = vi.fn()
  const signRouteTransportCall = vi.fn(() => ({ keyId: 'route-calls:test', signature: 'hmac-sha256:test' }))
  const createEvmX402PaymentSignature = vi.fn(async () => 'signed:payment')
  const credentialFromEnvironment = vi.fn((reference: string) => (
    reference === 'env:AE_TEST_PROVIDER_CREDENTIAL'
      ? '0xprovider-secret'
      : reference === 'env:AE_TEST_PAYMENT_CREDENTIAL'
        ? '0xpayer-secret'
        : undefined
  ))
  const x402PaymentCredentialRefFromEnvironment = vi.fn(() => (
    process.env.AE_X402_PAYMENT_CREDENTIAL_REF?.trim() || undefined
  ))
  const createGuardedLookup = vi.fn()
  const isPublicHttpTarget = vi.fn()
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
    createEvmX402PaymentSignature,
    credentialFromEnvironment,
    x402PaymentCredentialRefFromEnvironment,
    createGuardedLookup,
    isPublicHttpTarget,
    guardedFetch,
    FakeAgent,
  }
})

vi.mock('@/modules/action-invocation', async (importOriginal) => {
  const actual = await importOriginal<ActionInvocationModule>()
  return {
    ...actual,
    claimCanonicalInvocation: mocks.claimCanonicalInvocation,
    persistCanonicalReleaseFence: mocks.persistCanonicalReleaseFence,
    persistCanonicalTerminalOutcome: mocks.persistCanonicalTerminalOutcome,
  }
})
vi.mock('@/modules/capability-supply/route-transport-runtime', () => ({
  prepareRegisteredRouteTransportInvocation: mocks.prepareRegisteredRouteTransportInvocation,
  invokePreparedRouteTransport: mocks.invokePreparedRouteTransport,
}))
vi.mock('@/modules/capability-supply/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-supply/server')>()),
  signRouteTransportCall: mocks.signRouteTransportCall,
  createEvmX402PaymentSignature: mocks.createEvmX402PaymentSignature,
  credentialFromEnvironment: mocks.credentialFromEnvironment,
  x402PaymentCredentialRefFromEnvironment: mocks.x402PaymentCredentialRefFromEnvironment,
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

import { operationInvocationAttemptIdentityDigest, run } from '../../../convex/capabilityOperationInvocationWorker'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { PublishedOperation } from '@/modules/capability-supply/public'
import type {
  RouteTransportInvocation,
  RouteTransportObservation,
  X402PaymentAttemptEvent,
  X402PaymentAuthorizationIdentity,
  X402PaymentSignatureRequest,
  X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import type { StableHashValue } from '@/modules/common/stable-hash'

const invocationRef = 'operation-invocation:test-worker'
const grantRef = 'grant:test-worker'
const providerCredentialRef = 'env:AE_TEST_PROVIDER_CREDENTIAL'
const paymentCredentialRef = 'env:AE_TEST_PAYMENT_CREDENTIAL'
const attemptRef = `operation-attempt:${invocationRef}:1`
const digest = (digit: string) => `sha256:${digit.repeat(64)}`

type WorkerKind = 'x402' | 'http'
type WorkerOptions = Readonly<{
  environment?: 'sandbox' | 'production'
  operatorAccountVersion?: number
  priceUnits?: string
  actualOperatorAccountVersion?: number
  releaseFenceResult?: Readonly<{ kind: 'applied' }> | Readonly<{ kind: 'refused' }>
  finalGrant?: Readonly<Record<string, unknown>> | null
  observation?: RouteTransportObservation
  reconcileRefused?: boolean
  failPaymentObservation?: boolean
  preparePaymentErrorState?: 'possibly_submitted'
  consumeLeaseResult?: Readonly<{ kind: 'applied' }> | Readonly<{ kind: 'duplicate' }> | Readonly<{ kind: 'refused'; code: string }>
  currentOperation?: (operation: PublishedOperation) => PublishedOperation
}>
type PaymentState = {
  prepare: Record<string, unknown> | undefined
  read: Record<string, unknown> | undefined
  mark: Record<string, unknown> | undefined
  observe: Record<string, unknown> | undefined
}
type WorkerState = {
  dispatch: Record<string, unknown>
  operation: PublishedOperation
  money: Record<string, unknown> | undefined
  payment: PaymentState
  transportCalls: number
  mutations: string[]
  mutationCalls: Array<{ path: string; args: Record<string, unknown> }>
  records: Record<string, unknown>[]
  reconciliations: Record<string, unknown>[]
  unknownCharges: Record<string, unknown>[]
  qualifiedUse: Record<string, unknown>[]
}

type Handler = (ctx: unknown, args: { invocationRef: string }) => Promise<unknown>
const handler = (run as unknown as { _handler: Handler })._handler

function operationFor(kind: WorkerKind, validUntil: number, priceUnits = '1'): PublishedOperation {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  const price = { kind: 'fixed' as const, amount: { currency: 'USD', units: priceUnits, exponent: 2 } }
  const pricedOperation = priceUnits === '1'
    ? fixture.operation
    : {
        ...fixture.operation,
        identity: { ...fixture.operation.identity, price },
        offering: { ...fixture.operation.offering, presentation: { ...fixture.operation.offering.presentation, price } },
      }
  if (kind === 'x402') {
    return {
      ...pricedOperation,
      readiness: { ...pricedOperation.readiness, validUntil },
    }
  }
  const { connectionAuthority, ...operationWithoutConnectionAuthority } = pricedOperation
  void connectionAuthority
  return {
    ...operationWithoutConnectionAuthority,
    identity: { ...pricedOperation.identity, adapterId: 'http-json:v1' },
    binding: {
      ...pricedOperation.binding,
      authority: { kind: 'keyless' },
      adapter: { ...pricedOperation.binding.adapter, adapterId: 'http-json:v1' },
    },
    readiness: { ...pricedOperation.readiness, validUntil },
  }
}

function inRuntimeEnvironment(
  operation: PublishedOperation,
  runtimeEnvironment: 'sandbox' | 'production',
): PublishedOperation {
  const identity: PublishedOperation['identity'] & { runtimeEnvironment: 'sandbox' | 'production' } = {
    ...operation.identity,
    runtimeEnvironment,
  }
  return { ...operation, runtimeEnvironment, identity }
}

function createWorker(kind: WorkerKind, options: WorkerOptions = {}): { ctx: Record<string, unknown>; state: WorkerState } {
  const now = Date.now()
  const environment = options.environment ?? 'sandbox'
  const operation = inRuntimeEnvironment(operationFor(kind, now + 120_000, options.priceUnits), environment)
  const operatorAccountVersion = options.operatorAccountVersion ?? 0
  const actualOperatorAccountVersion = options.actualOperatorAccountVersion ?? operatorAccountVersion

  const descriptor = materializeRuntimePublishedOperation(operation)
  const input = { symbol: 'BTC', convert: 'USD' }
  const inputDigest = canonicalDigest(input as StableHashValue)
  const authorityExpiresAt = new Date(now + 60_000).toISOString()
  const acceptedBasis = { kind: 'approve_each' as const, authorityRef: `authority:${invocationRef}` }
  const limits = { amount: descriptor.price.kind === 'fixed' ? descriptor.price.amount : { currency: 'USD', units: '1', exponent: 2 } }
  const authorityMaterial = {
    invocationRef,
    operationRef: operation.operationId,
    inputDigest,
    grantRef,
    grantGeneration: 1,
    grantDigest: digest('g'),
    reference: acceptedBasis.authorityRef,
    targetDigest: canonicalDigest(operation.identity as StableHashValue),
    consequence: descriptor.consequenceClass,
    limits,
    expiresAt: authorityExpiresAt,
    acceptedBasis,
  }
  const authority = {
    ...authorityMaterial,
    decisionDigest: canonicalDigest({ format: 'operation-invoke-authority:v1', ...authorityMaterial } as StableHashValue),
  }
  const operationJson = JSON.stringify(operation)
  const currentOperation = options.currentOperation?.(operation) ?? operation
  const inputJson = JSON.stringify(input)
  const dispatch: Record<string, unknown> = {
    invocationRef,
    principalId: 'principal:test-worker',
    ownerId: 'owner:test-worker',
    credentialId: 'credential:test-worker',
    applicationRef: 'application:test-worker',
    environment,
    state: 'pending',
    operationRef: operation.operationId,
    idempotencyKey: 'idempotency:test-worker',
    inputDigest,
    requestDigest: digest('r'),
    grantRef,
    grantGeneration: 1,
    operationJson,
    inputJson,
    workId: 'work:test-worker',
    dispatchState: 'enqueued',
    authority,
  }
  const paymentIdentifier = operationInvocationAttemptIdentityDigest({
    invocationRef,
    principalId: 'principal:test-worker',
    credentialId: 'credential:test-worker',
    applicationRef: 'application:test-worker',
    environment,
    operationRef: operation.operationId,
    idempotencyKey: 'idempotency:test-worker',
    inputDigest,
    attemptRef,
    effectGeneration: 1,
  })
  const principal = {
    principalId: dispatch.principalId,
    ownerId: dispatch.ownerId,
    credentialId: dispatch.credentialId,
    applicationRef: dispatch.applicationRef,
    environment: dispatch.environment,
    lifecycle: 'active',
    grantGeneration: 1,
    scopes: ['market_operations:invoke'],
    authorityMode: 'approve_each',
  }
  const grant = {
    grantRef,
    principalId: dispatch.principalId,
    ownerId: dispatch.ownerId,
    applicationRef: dispatch.applicationRef,
    credentialId: dispatch.credentialId,
    environment: dispatch.environment,
    lifecycle: 'active' as const,
    generation: 1,
    policyDigest: digest('g'),
    expiresAt: now + 90_000,
  }
  const connectionAuthority = operation.connectionAuthority
  const providerAuthority = connectionAuthority === undefined ? undefined : {
    providerRef: connectionAuthority.providerRef,
    providerAccountRef: 'account:mock-provider',
    adapterId: connectionAuthority.adapterId,
    authorityGeneration: connectionAuthority.authorityGeneration,
    authorityDigest: connectionAuthority.authorityDigest,
    grantedScopes: [...connectionAuthority.grantedScopes],
    grantedResources: [...connectionAuthority.grantedResources],
    approvalDecisionRef: 'approval:test-worker',
    approvalDecisionDigest: digest('a'),
  }
  const recordedAt = new Date(now).toISOString()
  const actor = { callerRef: String(dispatch.credentialId), principalRef: String(dispatch.principalId) }
  const canonicalControl = {
    invocationRef,
    invocationVersion: 1,
    sourceRef: `operation-invocation-source:${invocationRef}`,
    control: {
      invocationRef,
      invocationVersion: 1,
      origin: { kind: 'standalone' as const, ...actor },
      owner: actor,
      action: { id: operation.operationId, contractVersion: String(descriptor.version) },
      desired: { state: 'invoke' as const },
      authority: { reference: acceptedBasis.authorityRef, expiresAt: authorityExpiresAt },
      acceptedAuthority: acceptedBasis,
      freshness: { state: 'current' as const, observedAt: recordedAt },
      control: {
        state: 'leased' as const,
        attemptRef,
        effectGeneration: 1,
        leaseOwner: 'operation-worker:test',
        leaseExpiresAt: authorityExpiresAt,
        release: 'not_started' as const,
      },
    },
    currentAttemptRef: attemptRef,
    currentEffectGeneration: 1,
    updatedAt: recordedAt,
  }
  const canonicalAttempt = {
    invocationRef,
    attemptRef,
    attemptNumber: 1,
    actor,
    effectGeneration: 1,
    lease: { owner: 'operation-worker:test', expiresAt: authorityExpiresAt },
    idempotency: {
      operationKey: operation.operationId,
      materialInputDigest: inputDigest,
      effectIdentity: digest('e'),
    },
    release: { state: 'not_released' as const },
    outcome: { state: 'running' as const },
    recordedAt,
  }
  let canonicalClaimed = false
  const payment: PaymentState = {
    prepare: undefined,
    read: undefined,
    mark: undefined,
    observe: undefined,
  }
  const state: WorkerState = {
    dispatch,
    operation,
    money: undefined,
    payment,
    transportCalls: 0,
    mutations: [],
    mutationCalls: [],
    records: [],
    reconciliations: [],
    unknownCharges: [],
    qualifiedUse: [],
  }
  const persistedPaymentMaterial = () => {
    const request = state.payment.prepare
    const challengeJson = request?.challengeJson
    const selectedRequirementJson = request?.selectedRequirementJson
    if (typeof challengeJson !== 'string' || typeof selectedRequirementJson !== 'string') return null
    let challenge: unknown
    let selectedRequirement: unknown
    try {
      challenge = JSON.parse(challengeJson)
      selectedRequirement = JSON.parse(selectedRequirementJson)
    } catch {
      return null
    }
    if (!isBoundedJsonValue(challenge) || !isBoundedJsonValue(selectedRequirement)) return null
    return {
      ...request,
      state: 'prepared',
      custodyRef: 'custody:test-worker',
      authorizationDigest: digest('p'),
      paymentIdentifierDigest: digest('i'),
    }
  }
  const functionPath = (reference: unknown): string => typeof reference === 'string' ? reference : getFunctionName(reference as never)
  mocks.claimCanonicalInvocation.mockResolvedValue({ kind: 'claimed', snapshot: { control: canonicalControl, attempt: canonicalAttempt } })
  mocks.persistCanonicalReleaseFence.mockResolvedValue(options.releaseFenceResult ?? { kind: 'applied', invocationVersion: 2 })
  mocks.persistCanonicalTerminalOutcome.mockResolvedValue({ kind: 'applied', invocationVersion: 3 })
  mocks.prepareRegisteredRouteTransportInvocation.mockImplementation((
    invocation: RouteTransportInvocation,
    x402PaymentSigningAvailable?: (input: {
      credentialRef: string
      network: string
      asset: string
      payTo: string
      maximumSpend: unknown
    }) => boolean,
  ) => {
    const requestDigest = canonicalDigest({
      adapterId: invocation.binding.adapterId,
      endpointUrl: invocation.binding.endpointUrl,
      configDigest: invocation.binding.configDigest,
      attemptRef: invocation.authority.attemptRef,
      operationKeyDigest: invocation.authority.operationKeyDigest,
      mandateDigest: invocation.authority.mandateDigest,
      grantDigest: invocation.authority.grantDigest,
      capabilityContractDigest: invocation.authority.capabilityContractDigest,
      inputJson: invocation.inputJson,
    })
    if (invocation.binding.adapterId === 'x402-fetch:v2'
      && x402PaymentSigningAvailable?.({
        credentialRef: 'none',
        network: '',
        asset: '',
        payTo: '',
        maximumSpend: invocation.authority.maximumSpend,
      }) === false) {
      return {
        kind: 'refused',
        observation: {
          transport: 'x402',
          disposition: 'refused',
          releaseStarted: false,
          requestDigest,
          failureCode: 'payment_signature_unavailable',
        },
      }
    }
    return {
      kind: 'prepared',
      prepared: {
        invocation,
        endpoint: new URL(invocation.binding.endpointUrl),
        configuration: JSON.parse(invocation.binding.configJson),
        requestDigest,
      },
    }
  })
  mocks.isPublicHttpTarget.mockResolvedValue(true)
  mocks.createGuardedLookup.mockReturnValue(() => undefined)
  const successfulOutputJson = JSON.stringify({
    data: {
      BTC: {
        symbol: 'BTC',
        quote: { USD: { price: 1, last_updated: '2026-08-09T00:00:00.000Z' } },
      },
    },
  })
  mocks.guardedFetch.mockImplementation(async () => new Response('{}', { status: 200 }))
  mocks.invokePreparedRouteTransport.mockImplementation(async (_prepared: unknown, runtimeValue: unknown) => {
    const runtime = runtimeValue as X402RouteTransportRuntime
    state.transportCalls += 1
    await runtime.send(new URL(operation.binding.endpointUrl), { method: 'POST' })
    if (kind === 'x402') {
      const challenge = {
        x402Version: 2 as const,
        resource: { url: operation.binding.endpointUrl },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:8453' as const,
          amount: '10000',
          asset: '0xmock-usdc',
          payTo: '0xmock-provider-recipient',
          maxTimeoutSeconds: 60,
          extra: {},
        }],
      }
      const request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity = {
        challenge,
        challengeDigest: canonicalDigest(challenge as StableHashValue),
        credential: paymentCredentialRef,
        paymentIdentifier,
        selectedRequirement: challenge.accepts[0]!,
        paymentAmount: { currency: 'USD', units: '1', exponent: 2 },
        attemptRef,
        effectGeneration: 1,
      }
      const prepared = await runtime.prepareX402PaymentAuthorization(request)
      expect(prepared).toEqual({ custodyRef: 'custody:test-worker', authorizationDigest: digest('p') })
      if (prepared === undefined) throw new Error('x402 custody preparation failed')
      const signed = await runtime.readX402PaymentAuthorizationByDigest(prepared)
      expect(signed).toBe('signed:payment')
      const event: X402PaymentAttemptEvent = {
        paymentIdentifier: request.paymentIdentifier,
        attemptRef,
        challengeDigest: request.challengeDigest,
        scheme: request.selectedRequirement.scheme,
        network: request.selectedRequirement.network,
        asset: request.selectedRequirement.asset,
        payTo: request.selectedRequirement.payTo,
        amount: request.paymentAmount,
        providerEndpoint: request.challenge.resource.url,
        custodyRef: prepared.custodyRef,
        authorizationDigest: prepared.authorizationDigest,
      }
      const markX402PaymentPossiblySubmitted = runtime.markX402PaymentPossiblySubmitted
      const observeX402PaymentAttempt = runtime.observeX402PaymentAttempt
      if (markX402PaymentPossiblySubmitted === undefined || observeX402PaymentAttempt === undefined) {
        throw new Error('x402 persistence callbacks missing')
      }
      await markX402PaymentPossiblySubmitted(event)
      await observeX402PaymentAttempt({
        ...event,
        state: 'settled',
        settlementEvidence: {
          kind: 'settled',
          response: {
            success: true,
            transaction: '0xworker-settled',
            network: request.selectedRequirement.network,
            amount: request.selectedRequirement.amount,
          },
          digest: digest('s'),
        },
        evidenceRefs: ['evidence:test-worker'],
      })
    }
    return options.observation ?? (kind === 'x402'
      ? {
          transport: 'x402',
          disposition: 'succeeded',
          releaseStarted: true,
          requestDigest: digest('c'),
          outputJson: successfulOutputJson,
          paymentSubmissionStatus: 'observed',
          settlementEvidence: {
            kind: 'settled',
            response: {
              success: true,
              transaction: '0xworker-settled',
              network: 'eip155:8453',
              amount: '10000',
            },
            digest: digest('s'),
          },
        }
      : {
          transport: 'http',
          disposition: 'succeeded',
          releaseStarted: true,
          requestDigest: digest('c'),
          outputJson: successfulOutputJson,
        })
  })
  const chargeAmount = descriptor.price.kind === 'fixed'
    ? descriptor.price.amount
    : { currency: 'USD', units: '0', exponent: 2 }
  const chargeState: 'free_tier' | 'paid' = chargeAmount.units === '0' ? 'free_tier' : 'paid'
  let activeGrantReads = 0

  const ctx = {
    runQuery: vi.fn(async (reference: unknown, args?: Record<string, unknown>) => {
      switch (functionPath(reference)) {
        case 'capabilityOperationInvocations:openDispatch': return dispatch
        case 'agentAccessPrincipals:getAgentPrincipal': return principal
        case 'agentAccessPolicy:readActiveGrant':
          activeGrantReads += 1
          return activeGrantReads > 1 && options.finalGrant !== undefined ? options.finalGrant : grant
        case 'capabilitySupplyOperations:readCurrentPublishedOperationSnapshot': return { operationJson: JSON.stringify(currentOperation) }
        case 'moneyLedger:readOperatorAccountVersion': return operatorAccountVersion
        case 'capabilityOperationInvocations:readProviderLeaseAuthority': return providerAuthority
        case 'actionInvocationControl:readControl': return canonicalClaimed ? canonicalControl : undefined
        case 'actionInvocationControl:readAttempt': return canonicalClaimed ? canonicalAttempt : undefined
        case 'capabilityProviderConnections:resolveLeaseCredentialRef': return { kind: 'resolved', credentialRef: providerCredentialRef }
        case 'customerRequestRouteExecution:readX402PaymentAuthorizationByDigest':
        case 'customerRequestRouteExecution:readX402PaymentAuthorization': return persistedPaymentMaterial()
        case 'capabilityProviderConnections:validateLeaseAuthority': return { kind: 'valid' }
        case 'customerRequestRouteExecution:readX402PaymentAttempt':
          return state.payment.prepare === undefined
            ? null
            : {
                ...state.payment.prepare,
                state: options.preparePaymentErrorState ?? 'settled',
                evidenceRefs: ['evidence:test-worker'],
              }
        default: throw new Error(`unexpected_query:${functionPath(reference)}:${JSON.stringify(args)}`)
      }
    }),
    runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
      const path = functionPath(reference)
      state.mutations.push(path)
      state.mutationCalls.push({ path, args })
      switch (path) {
        case 'capabilityOperationInvocations:claimDispatch':
          canonicalClaimed = true
          return { kind: 'applied', attemptRef, effectGeneration: 1 }
        case 'capabilityOperationInvocations:finalizeDispatch': {
          const projection = args.projection
          if (projection && typeof projection === 'object') {
            const projected = projection as {
              state?: unknown
              dispatchState?: unknown
              result?: unknown
            }
            state.records.push(projected as Record<string, unknown>)
            if (typeof projected.state === 'string') dispatch.state = projected.state
            if (typeof projected.dispatchState === 'string') dispatch.dispatchState = projected.dispatchState
            if ('result' in projected) dispatch.result = projected.result
          }
          return { kind: 'applied', attemptRef, effectGeneration: 1 }
        }
        case 'capabilityOperationInvocations:record':
          state.records.push(args)
          return null
        case 'capabilityProviderConnections:issueLease': return {
          kind: 'applied',
          lease: {
            leaseRef: 'lease:test-worker',
            authorityGeneration: providerAuthority?.authorityGeneration ?? 1,
            authorityDigest: providerAuthority?.authorityDigest ?? digest('a'),
            grantedScopes: providerAuthority?.grantedScopes ?? [],
            grantedResources: providerAuthority?.grantedResources ?? [],
            expiresAt: now + 30_000,
          },
        }
        case 'capabilityProviderConnections:consumeLease': return options.consumeLeaseResult ?? { kind: 'applied' }
        case 'capabilityProviderConnections:expireLease': return { kind: 'applied' }
        case 'capabilityProviderConnections:invalidateLease': return { kind: 'applied' }
        case 'moneyLedger:authorizeInvocationCharge':
          state.money = args
          if (args.expectedAccountVersion !== actualOperatorAccountVersion) {
            return { kind: 'refused', code: 'ledger_cas_conflict', retryable: true }
          }
          return {
            kind: 'accepted',
            chargeState,
            amount: chargeAmount,
            priceDigest: digest('p'),
            usageRef: 'usage:accepted-result',
            observedAt: now - 10,
            ...(chargeState === 'paid' ? { transactionRef: 'transaction:accepted-result' } : {}),
          }
        case 'moneyLedger:reconcileInvocationCharge':
          state.reconciliations.push(args)
          return options.reconcileRefused
            ? { kind: 'reconciliation_required' }
            : { kind: 'settled' }
        case 'moneyLedger:markChargeOutcomeUnknown':
          state.unknownCharges.push(args)
          return { kind: 'outcome_unknown', transactionRef: args.transactionRef }
        case 'moneyLedger:reserveExternalInvocationSpend':
          return { kind: 'accepted', status: 'reserved', replayed: false }
        case 'moneyLedger:finalizeExternalInvocationSpend':
          return args.settlementStatus === 'unknown'
            ? { kind: 'reconciliation_required' }
            : {
                kind: 'accepted',
                status: args.settlementStatus === 'settled' ? 'settled' : 'released',
                replayed: false,
              }
        case 'customerRequestRouteExecution:prepareX402PaymentAuthorization':
          state.payment.prepare = args
          if (options.preparePaymentErrorState !== undefined) {
            throw new Error('x402_payment_attempt_reconciliation_required')
          }
          return { custodyRef: 'custody:test-worker', authorizationDigest: digest('p') }
        case 'customerRequestRouteExecution:markX402PaymentPossiblySubmitted':
          state.payment.mark = args
          return null
        case 'customerRequestRouteExecution:observeX402PaymentAttempt':
          state.payment.observe = args
          return null
        case 'customerRequestRouteExecution:recordX402PaymentObservation':
          if (options.failPaymentObservation) throw new Error('payment_observation_unavailable')
          return null
        case 'customerRequestRouteExecution:recordX402PaymentSignature':
          return null
        case 'qualifiedUse:recordQualifiedUse':
          state.qualifiedUse.push(args)
          return args.environment === 'production'
            ? { kind: 'recorded' }
            : { kind: 'excluded', reason: 'non_production_environment' }
        default: throw new Error(`unexpected_mutation:${path}:${JSON.stringify(args)}`)
      }
    }),
  }
  return { ctx, state }
}

describe('capability operation invocation worker', () => {
  beforeEach(() => {
    mocks.claimCanonicalInvocation.mockReset()
    mocks.persistCanonicalReleaseFence.mockReset()
    mocks.persistCanonicalTerminalOutcome.mockReset()
    mocks.prepareRegisteredRouteTransportInvocation.mockReset()
    mocks.invokePreparedRouteTransport.mockReset()
    mocks.signRouteTransportCall.mockClear()
    mocks.createEvmX402PaymentSignature.mockClear()
    mocks.credentialFromEnvironment.mockClear()
    mocks.x402PaymentCredentialRefFromEnvironment.mockClear()
    mocks.createGuardedLookup.mockReset()
    mocks.isPublicHttpTarget.mockReset()
    mocks.guardedFetch.mockReset()
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.stubEnv('AE_TEST_PROVIDER_CREDENTIAL', '0xprovider-secret')
    vi.stubEnv('AE_X402_PAYMENT_CREDENTIAL_REF', paymentCredentialRef)
    vi.stubEnv('AE_TEST_PAYMENT_CREDENTIAL', '0xpayer-secret')
  })
  it('completes provider-direct x402 with payment evidence and no AE money effects', async () => {
    const worker = createWorker('x402')
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.mutationCalls.map(({ path }) => path).filter((path) =>
      path === 'moneyLedger:authorizeInvocationCharge'
      || path === 'moneyLedger:reconcileInvocationCharge')).toHaveLength(0)
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      state: 'completed',
      usage: {
        usageRef: `operation-x402-payment:${invocationRef}:${attemptRef}`,
        observedAt: expect.any(Number),
        chargeState: 'paid',
        amount: { currency: 'USD', units: '1', exponent: 2 },
        priceDigest: expect.any(String),
      },
    })
    expect(worker.state.transportCalls).toBe(1)
    expect(worker.state.payment.prepare).toMatchObject({
      dispatchRef: invocationRef,
      attemptRef,
      effectGeneration: 1,
      credentialRef: paymentCredentialRef,
    })
    expect(worker.state.payment.mark).toMatchObject({ dispatchRef: invocationRef, effectGeneration: 1 })
    expect(worker.state.payment.observe).toMatchObject({ dispatchRef: invocationRef, effectGeneration: 1 })
    expect(mocks.createEvmX402PaymentSignature).toHaveBeenCalledWith(expect.objectContaining({ credential: '0xpayer-secret' }))
    expect(mocks.invokePreparedRouteTransport).toHaveBeenCalledTimes(1)
    expect(worker.state.qualifiedUse).toEqual([
      expect.objectContaining({
        invocationRef,
        attemptRef,
        effectGeneration: 1,
        usageRef: `operation-x402-payment:${invocationRef}:${attemptRef}`,
      }),
    ])
  })
  it('refuses a production provider-direct x402 lane before transport or money effects', async () => {
    const worker = createWorker('x402', { environment: 'production' })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.mutationCalls.map(({ path }) => path).filter((path) => path.startsWith('moneyLedger:'))).toHaveLength(0)
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'payment_lane_not_brokered', retryable: false },
    })
  })
  it('refuses missing x402 payer custody before money reservation or transport', async () => {
    vi.stubEnv('AE_X402_PAYMENT_CREDENTIAL_REF', '')
    const worker = createWorker('x402')

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused' },
    })
    expect(worker.state.qualifiedUse).toHaveLength(0)
  })
  it('keeps a possibly submitted x402 reservation for reconciliation after retry', async () => {
    const worker = createWorker('x402', {
      preparePaymentErrorState: 'possibly_submitted',
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const finalizations = worker.state.mutationCalls.filter(
      ({ path }) => path === 'moneyLedger:finalizeExternalInvocationSpend',
    )
    expect(finalizations).not.toContainEqual(expect.objectContaining({
      args: expect.objectContaining({ submissionStatus: 'not_submitted' }),
    }))
    expect(finalizations).toContainEqual(expect.objectContaining({
      args: expect.objectContaining({
        submissionStatus: 'unknown',
        settlementStatus: 'unknown',
      }),
    }))
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
    })
  })
  it('uses the current operation when only readiness observation changes', async () => {
    const worker = createWorker('http', {
      currentOperation: (operation) => ({
        ...operation,
        readiness: {
          ...operation.readiness,
          observedAt: operation.readiness.observedAt + 1_000,
          qualificationDigest: digest('q'),
        },
      }),
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'capabilityOperationInvocations:claimDispatch')).toHaveLength(1)
    expect(mocks.claimCanonicalInvocation).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).toHaveBeenCalledTimes(1)
    expect(worker.state.transportCalls).toBe(1)
  })

  it('refuses changed operation material before claim or transport', async () => {
    const worker = createWorker('http', {
      currentOperation: (operation) => ({
        ...operation,
        operationId: `${operation.operationId}:changed`,
        materialDigest: digest('m'),
        identity: {
          ...operation.identity,
          publicationRef: `${operation.identity.publicationRef}:changed`,
        },
      }),
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'operation_not_current' },
    })
    expect(mocks.claimCanonicalInvocation).not.toHaveBeenCalled()
    expect(mocks.prepareRegisteredRouteTransportInvocation).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
  })

  it('settles exactly one AE-internal charge after valid output', async () => {
    const worker = createWorker('http')
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toMatchObject({
      amount: { currency: 'USD', units: '1', exponent: 2 },
      freeTier: false,
      credentialBudgetGrantRef: grantRef,
      credentialBudgetGeneration: 1,
    })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.reconciliations[0]).toMatchObject({
      transactionRef: 'transaction:accepted-result',
      outcome: 'released',
    })
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      usage: {
        usageRef: 'usage:accepted-result',
        observedAt: expect.any(Number),
        chargeState: 'paid',
        amount: { units: '1', currency: 'USD', exponent: 2 },
        priceDigest: digest('p'),
        transactionRef: 'transaction:accepted-result',
      },
    })
    expect(worker.state.transportCalls).toBe(1)
    expect(mocks.createEvmX402PaymentSignature).not.toHaveBeenCalled()
  })
  it('reverses an AE-internal charge for schema-invalid output before completion', async () => {
    const worker = createWorker('http', {
      observation: {
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: false,
        requestDigest: digest('i'),
        outputJson: JSON.stringify({ unexpected: true }),
      },
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.reconciliations[0]).toMatchObject({
      transactionRef: 'transaction:accepted-result',
      outcome: 'not_released',
    })
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
    expect(worker.state.records.at(-1)).toMatchObject({ state: 'refused' })
  })
  it('reverses an AE-internal charge for schema-invalid output after release without uncertainty', async () => {
    const worker = createWorker('http', {
      observation: {
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest: digest('i'),
        outputJson: JSON.stringify({ unexpected: true }),
      },
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.reconciliations[0]).toMatchObject({
      transactionRef: 'transaction:accepted-result',
      outcome: 'not_released',
    })
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:markChargeOutcomeUnknown')).toHaveLength(0)
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused' },
    })
  })
  it('replays the canonical terminal effect without a second money entry', async () => {
    const worker = createWorker('http')
    mocks.claimCanonicalInvocation.mockReset()
    mocks.claimCanonicalInvocation
      .mockResolvedValueOnce({
        kind: 'claimed',
        snapshot: {
          control: { currentAttemptRef: attemptRef },
          attempt: { attemptRef, effectGeneration: 1 },
        },
      })
      .mockResolvedValueOnce({ kind: 'terminal_replay' })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'none' })

    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.transportCalls).toBe(1)
    expect(worker.state.records.filter((record) => record.state === 'completed')).toHaveLength(1)
  })
  it('authorizes exactly once after a prior top-up advances the operator account version', async () => {
    const worker = createWorker('http', { operatorAccountVersion: 1 })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.money).toMatchObject({ expectedAccountVersion: 1 })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.transportCalls).toBe(1)
  })

  it('fails closed on a stale operator-version read before provider I/O', async () => {
    const worker = createWorker('http', { operatorAccountVersion: 1, actualOperatorAccountVersion: 2 })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.money).toMatchObject({ expectedAccountVersion: 1 })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.transportCalls).toBe(0)
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'ledger_cas_conflict', retryable: true },
    })
  })

  it('settles a zero-price accepted charge and projects free-tier usage', async () => {
    const worker = createWorker('http', { priceUnits: '0' })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toMatchObject({
      amount: { currency: 'USD', units: '0', exponent: 2 },
      freeTier: false,
      credentialBudgetGrantRef: grantRef,
      credentialBudgetGeneration: 1,
    })
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      usage: {
        usageRef: 'usage:accepted-result',
        observedAt: expect.any(Number),
        chargeState: 'free_tier',
        amount: { units: '0', currency: 'USD', exponent: 2 },
        priceDigest: digest('p'),
      },
    })
  })

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


  it('keeps reconciliation required when pre-release money settlement refuses', async () => {
    const worker = createWorker('http', {
      releaseFenceResult: { kind: 'refused' },
      reconcileRefused: true,
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: { kind: 'reconciliation_required' },
    })
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
  })

  it('marks an uncertain possible release unknown and requires reconciliation', async () => {
    const worker = createWorker('http', {
      observation: {
        transport: 'http',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: digest('u'),
      },
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.unknownCharges).toContainEqual(expect.objectContaining({
      transactionRef: 'transaction:accepted-result',
      principalId: 'principal:test-worker',
    }))
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: { kind: 'reconciliation_required' },
    })
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
    expect(worker.state.reconciliations).toHaveLength(0)
  })

  it('keeps provider-direct x402 reconciliation required when payment evidence persistence fails', async () => {
    const worker = createWorker('x402', { failPaymentObservation: true })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.mutationCalls.map(({ path }) => path)).toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(worker.state.mutationCalls.map(({ path }) => path)).not.toContain('moneyLedger:finalizeExternalInvocationSpend')
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: { kind: 'reconciliation_required' },
    })
  })

})
