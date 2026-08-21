import { getFunctionName } from 'convex/server'
import { beforeEach, expect, vi } from 'vitest'
type ActionInvocationModule = Record<string, unknown>
type SignRouteTransportCall = typeof import('@/modules/capability-supply/server').signRouteTransportCall
const mocks = vi.hoisted(() => {
  const claimCanonicalInvocation = vi.fn()
  const persistCanonicalReleaseFence = vi.fn()
  const persistCanonicalTerminalOutcome = vi.fn()
  const prepareRegisteredRouteTransportInvocation = vi.fn()
  const invokePreparedRouteTransport = vi.fn()
  const signRouteTransportCall = vi.fn<SignRouteTransportCall>(() => ({ keyId: 'route-calls:test', signature: 'hmac-sha256:test' }))
  const createCdpEvmX402PaymentSignature = vi.fn(async (
    _request: unknown,
    dependencies: {
      persistedIntent?: unknown
      onUnsignedMaterial?: (intent: Record<string, string | number>) => Promise<void> | void
    },
  ) => {
    if (dependencies.persistedIntent === undefined) {
      const paymentAuthorizationValidBefore = '9999999999'
      await dependencies.onUnsignedMaterial?.({
        paymentUnsignedMaterialJson: '{}',
        paymentUnsignedMaterialDigest: `sha256:${'u'.repeat(64)}`,
        paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111',
        paymentPayer: '0xmock-payer',
        paymentNonce: 'nonce:test-worker',
        paymentAuthorizationValidBefore,
        paymentAuthorizationExpiresAt: Number(BigInt(paymentAuthorizationValidBefore) * 1000n),
        requestFingerprint: `sha256:${'f'.repeat(64)}`,
      })
    }
    return 'signed:payment'
  })
  const createSandboxEvmX402PaymentSignature = vi.fn(async () => 'signed:payment')
  const cdpX402RequestFingerprint = vi.fn(() => `sha256:${'f'.repeat(64)}`)
  const readCdpX402PaymentAuthorization = vi.fn((
    _paymentSignature: string,
    _request: unknown,
    _context: unknown,
    requestFingerprint: string,
  ) => ({
    paymentSignatureDigest: `sha256:${'s'.repeat(64)}`,
    paymentPayer: '0xmock-payer',
    paymentNonce: 'nonce:test-worker',
    requestFingerprint,
  }))
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
  const custodyConfiguration = {
    apiKeyId: 'key-id',
    apiKeySecret: 'key-secret',
    walletSecret: 'wallet-secret',
    accountName: 'account:test-worker',
    expectedEvmAddress: '0x0000000000000000000000000000000000000001',
    accountPolicyId: '11111111-1111-4111-8111-111111111111',
    projectPolicyId: '22222222-2222-4222-8222-222222222222',
    credentialGeneration: 7,
    maxAtomic: 10_000n,
    dailyMaxAtomic: 100_000n,
  } as const
  const cdpX402CustodyConfigurationFromEnvironment = vi.fn<
    () => typeof custodyConfiguration | undefined
  >(() => custodyConfiguration)
  const cdpX402CustodyBudgetRef = vi.fn(() => 'custody:test-worker')
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
    createCdpEvmX402PaymentSignature,
    createSandboxEvmX402PaymentSignature,
    cdpX402RequestFingerprint,
    readCdpX402PaymentAuthorization,
    credentialFromEnvironment,
    x402PaymentCredentialRefFromEnvironment,
    cdpX402CustodyConfigurationFromEnvironment,
    cdpX402CustodyBudgetRef,
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
  createCdpEvmX402PaymentSignature: mocks.createCdpEvmX402PaymentSignature,
  createSandboxEvmX402PaymentSignature: mocks.createSandboxEvmX402PaymentSignature,
  cdpX402RequestFingerprint: mocks.cdpX402RequestFingerprint,
  readCdpX402PaymentAuthorization: mocks.readCdpX402PaymentAuthorization,
  credentialFromEnvironment: mocks.credentialFromEnvironment,
  x402PaymentCredentialRefFromEnvironment: mocks.x402PaymentCredentialRefFromEnvironment,
  cdpX402CustodyConfigurationFromEnvironment: mocks.cdpX402CustodyConfigurationFromEnvironment,
  cdpX402CustodyBudgetRef: mocks.cdpX402CustodyBudgetRef,
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
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'
import { operationInvokeReceiptAsset } from '@/modules/capability-execution/operation-invoke-contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  externalSpendIdentityDigest,
  mintExternalSpendIdentity,
  pricingConfigDigest,
  type ExternalSpendPaymentFacts,
  type PricingConfig,
} from '@/modules/money/public'
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

export const invocationRef = 'operation-invocation:test-worker'
export const grantRef = 'grant:test-worker'
const providerCredentialRef = 'env:AE_TEST_PROVIDER_CREDENTIAL'
export const paymentCredentialRef = 'env:AE_TEST_PAYMENT_CREDENTIAL'
export const attemptRef = `operation-attempt:${invocationRef}:1`
export const digest = (digit: string) => `sha256:${digit.repeat(64)}`

type WorkerKind = 'x402' | 'http'
type WorkerOptions = Readonly<{
  environment?: 'sandbox' | 'production'
  operatorAccountVersion?: number
  priceUnits?: string
  actualOperatorAccountVersion?: number
  releaseFenceResult?: Readonly<{ kind: 'applied' }> | Readonly<{ kind: 'refused' }>
  finalGrant?: Readonly<Record<string, unknown>> | null
  signingBoundaryGrant?: Readonly<Record<string, unknown>> | null
  observation?: RouteTransportObservation
  reconcileRefused?: boolean
  reconcileNone?: boolean
  failPaymentObservation?: boolean
  failPaymentSignature?: boolean
  preparePaymentErrorState?: 'possibly_submitted'
  invalidOutputTransitionResult?: 'accepted' | 'refused' | 'throw'
  invalidOutputLossResult?: 'settled' | 'refused' | 'throw'
  consumeLeaseResult?: Readonly<{ kind: 'applied' }> | Readonly<{ kind: 'duplicate' }> | Readonly<{ kind: 'refused'; code: string }>
  currentOperation?: (operation: PublishedOperation) => PublishedOperation
  alreadyLeased?: boolean
  claimDispatchRefused?: boolean
  activeCharge?: Readonly<Record<string, unknown>>
  stalePrincipal?: boolean
}>
type PaymentState = {
  prepare: Record<string, unknown> | undefined
  read: Record<string, unknown> | undefined
  mark: Record<string, unknown> | undefined
  observe: Record<string, unknown> | undefined
  authorization: {
    claimed: boolean
    paymentUnsignedMaterialJson?: string
    paymentUnsignedMaterialDigest?: string
    paymentSigningIdempotencyKey?: string
    paymentSignatureDigest?: string
    paymentPayer?: string
    paymentNonce?: string
    paymentAuthorizationValidBefore?: string
    paymentAuthorizationExpiresAt?: number
    requestFingerprint?: string
  }
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
export const handler = (run as unknown as { _handler: Handler })._handler

function operationWithPricing(
  operation: PublishedOperation,
  pricingConfig: PricingConfig,
): PublishedOperation {
  const price = { kind: 'fixed' as const, amount: pricingConfig.paidAmount }
  const priceDigest = pricingConfigDigest(pricingConfig)
  const identity = {
    ...operation.identity,
    pricingConfig,
    priceDigest,
    price,
  }
  return {
    ...operation,
    identity,
    pricingConfig,
    priceDigest,
    materialDigest: canonicalDigest(identity as StableHashValue),
    offering: {
      ...operation.offering,
      presentation: { ...operation.offering.presentation, price },
    },
  }
}

function operationFor(kind: WorkerKind, validUntil: number, priceUnits = '1', brokered = false): PublishedOperation {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  const priceAmount = { currency: 'USD', units: brokered ? '2' : priceUnits, exponent: 2 } as const
  const pricedOperation = priceUnits === '1' && !brokered
    ? fixture.operation
    : operationWithPricing(fixture.operation, brokered
        ? {
            version: 'pricing:v2',
            unit: 'call',
            paidAmount: priceAmount,
            providerAmount: { currency: 'USD', units: '1', exponent: 2 },
            platformFee: { currency: 'USD', units: '1', exponent: 2 },
          }
        : {
            ...fixture.operation.identity.pricingConfig,
            paidAmount: priceAmount,
          })
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
  return {
    ...operation,
    runtimeEnvironment,
    identity,
    materialDigest: canonicalDigest(identity as StableHashValue),
  }
}

export function createWorker(kind: WorkerKind, options: WorkerOptions = {}): { ctx: Record<string, unknown>; state: WorkerState } {
  const now = Date.now()
  const environment = options.environment ?? 'sandbox'
  const baseOperation = operationFor(
    kind,
    now + 120_000,
    options.priceUnits,
    environment === 'production' && kind === 'x402',
  )
  const operation = inRuntimeEnvironment(
    kind === 'x402' && environment === 'production' && baseOperation.identity.payment.kind === 'x402'
      ? {
          ...baseOperation,
          identity: {
            ...baseOperation.identity,
            payment: { ...baseOperation.identity.payment, asset: operationInvokeReceiptAsset },
          },
        }
      : baseOperation,
    environment,
  )
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
    grantGeneration: options.stalePrincipal === true ? 2 : 1,
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
  let canonicalClaimed = options.alreadyLeased === true
  const payment: PaymentState = {
    prepare: undefined,
    read: undefined,
    mark: undefined,
    observe: undefined,
    authorization: { claimed: false },
  }
  const state: WorkerState = {
    dispatch,
    operation,
    money: options.activeCharge === undefined ? undefined : { ...options.activeCharge },
    payment,
    transportCalls: 0,
    mutations: [],
    mutationCalls: [],
    records: [],
    reconciliations: [],
    unknownCharges: [],
    qualifiedUse: [],
  }
  const persistedPaymentMaterial = (requestedFingerprint?: unknown) => {
    const request = state.payment.prepare
    const challengeJson = request?.challengeJson
    const selectedRequirementJson = request?.selectedRequirementJson
    if (
      request === undefined
      || typeof challengeJson !== 'string'
      || typeof selectedRequirementJson !== 'string'
    ) return null
    if (typeof requestedFingerprint === 'string'
      && typeof request.requestFingerprint === 'string'
      && request.requestFingerprint !== requestedFingerprint) {
      throw new Error('x402_payment_request_fingerprint_conflict')
    }
    let challenge: unknown
    let selectedRequirement: unknown
    try {
      challenge = JSON.parse(challengeJson)
      selectedRequirement = JSON.parse(selectedRequirementJson)
    } catch {
      return null
    }
    if (!isBoundedJsonValue(challenge) || !isBoundedJsonValue(selectedRequirement)) return null
    const authorization = state.payment.authorization
    return {
      ...request,
      state: state.payment.mark === undefined ? 'prepared' : 'possibly_submitted',
      custodyRef: 'custody:test-worker',
      ...(request.custodyBudgetRef === undefined
        ? {}
        : {
            custodyBudgetRef: request.custodyBudgetRef,
            custodyGeneration: request.custodyGeneration,
            custodyDailyMaximumUnits: request.custodyDailyMaximumUnits,
          }),
      authorizationDigest: digest('p'),
      paymentIdentifierDigest: digest('i'),
      ...(authorization.paymentUnsignedMaterialJson === undefined
        ? {}
        : { paymentUnsignedMaterialJson: authorization.paymentUnsignedMaterialJson }),
      ...(authorization.paymentUnsignedMaterialDigest === undefined
        ? {}
        : { paymentUnsignedMaterialDigest: authorization.paymentUnsignedMaterialDigest }),
      ...(authorization.paymentSigningIdempotencyKey === undefined
        ? {}
        : { paymentSigningIdempotencyKey: authorization.paymentSigningIdempotencyKey }),
      ...(authorization.paymentSignatureDigest === undefined
        ? {}
        : { paymentSignatureDigest: authorization.paymentSignatureDigest }),
      ...(authorization.paymentPayer === undefined
        ? {}
        : { paymentPayer: authorization.paymentPayer }),
      ...(authorization.paymentNonce === undefined
        ? {}
        : { paymentNonce: authorization.paymentNonce }),
      ...(authorization.paymentAuthorizationValidBefore === undefined
        ? {}
        : { paymentAuthorizationValidBefore: authorization.paymentAuthorizationValidBefore }),
      ...(authorization.paymentAuthorizationExpiresAt === undefined
        ? {}
        : { paymentAuthorizationExpiresAt: authorization.paymentAuthorizationExpiresAt }),
      ...(authorization.requestFingerprint === undefined
        ? {}
        : { requestFingerprint: authorization.requestFingerprint }),
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
      const paymentCredential = runtime.readX402PaymentCredentialRef === undefined
        ? undefined
        : await runtime.readX402PaymentCredentialRef()
      if (paymentCredential === undefined) throw new Error('x402 payment credential locator missing')
      const request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity = {
        challenge,
        challengeDigest: canonicalDigest(challenge as StableHashValue),
        credential: paymentCredential,
        paymentIdentifier,
        selectedRequirement: challenge.accepts[0]!,
        paymentAmount: { currency: 'USD', units: '1', exponent: 2 },
        attemptRef,
        effectGeneration: 1,
      }
      const prepared = await runtime.prepareX402PaymentAuthorization(request)
      if (environment === 'production') {
        expect(prepared).toMatchObject({
          custodyRef: 'custody:test-worker',
          custodyBudgetRef: 'custody:test-worker',
          custodyGeneration: 7,
          custodyDailyMaximumUnits: '100000',
          authorizationDigest: digest('p'),
        })
        expect(state.mutationCalls.find(({ path }) => path === 'moneyLedger:reserveExternalInvocationSpend')?.args)
          .toMatchObject({
            custodyRef: 'custody:test-worker',
            custodyGeneration: 7,
            custodyDailyMaximum: { currency: 'USD', units: '100000', exponent: 2 },
          })
      }
      if (prepared === undefined) throw new Error('x402 custody preparation failed')
      if (options.failPaymentSignature) {
        return {
          transport: 'x402',
          disposition: 'refused',
          releaseStarted: false,
          requestDigest: digest('f'),
          failureCode: 'payment_signature_unavailable',
          paymentSubmissionStatus: 'not_submitted',
          settlementEvidence: { kind: 'not_submitted' },
        }
      }
      const signed = await runtime.readX402PaymentAuthorizationByDigest(prepared)
      if (signed === undefined) {
        return {
          transport: 'x402',
          disposition: 'refused',
          releaseStarted: false,
          requestDigest: digest('f'),
          failureCode: 'payment_signature_unavailable',
          paymentSubmissionStatus: 'not_submitted',
          settlementEvidence: { kind: 'not_submitted' },
        }
      }
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
          if (activeGrantReads > 2 && options.signingBoundaryGrant !== undefined) return options.signingBoundaryGrant
          return activeGrantReads > 1 && options.finalGrant !== undefined ? options.finalGrant : grant
        case 'capabilitySupplyOperations:readCurrentPublishedOperationSnapshot': return { operationJson: JSON.stringify(currentOperation) }
        case 'moneyLedger:readOperatorAccountVersion': return operatorAccountVersion
        case 'capabilityOperationInvocations:readProviderLeaseAuthority': return providerAuthority
        case 'actionInvocationControl:readControl': return canonicalClaimed ? canonicalControl : undefined
        case 'actionInvocationControl:readAttempt': return canonicalClaimed ? canonicalAttempt : undefined
        case 'capabilityProviderConnections:resolveLeaseCredentialRef': return { kind: 'resolved', credentialRef: providerCredentialRef }
        case 'moneyX402PaymentAttempts:readX402PaymentAuthorizationByDigest':
        case 'moneyX402PaymentAttempts:readX402PaymentAuthorization': {
          const material = persistedPaymentMaterial(args?.requestFingerprint)
          state.payment.read = material ?? undefined
          return material
        }
        case 'capabilityProviderConnections:validateLeaseAuthority': return { kind: 'valid' }
        case 'moneyX402PaymentAttempts:readX402PaymentAttempt':
          return state.payment.prepare === undefined
            ? null
            : {
                ...state.payment.prepare,
                state: state.payment.mark === undefined
                  ? options.preparePaymentErrorState ?? 'settled'
                  : 'possibly_submitted',
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
          if (options.claimDispatchRefused === true) return { kind: 'refused', code: 'stale_invocation_version' }
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
        case 'moneyLedger:reserveBrokeredInvocationCharge':
          state.money = args
          if (args.expectedAccountVersion !== actualOperatorAccountVersion) {
            return { kind: 'refused', code: 'ledger_cas_conflict', retryable: true }
          }
          {
            const amount = args.amount as { currency: string; units: string; exponent: number }
            return {
            kind: 'accepted',
            chargeState: 'paid',
            amount,
            priceDigest: args.priceDigest,
            transactionRef: args.transactionRef,
            providerNet: { currency: amount.currency, units: '1', exponent: amount.exponent },
            rake: { currency: amount.currency, units: '1', exponent: amount.exponent },
            usageRef: 'usage:brokered-result',
            observedAt: now,
            }
          }
        case 'moneyLedger:finalizeBrokeredInvocationCharge':
          {
            const amount = args.amount as { currency: string; units: string; exponent: number }
            return {
            kind: 'accepted',
            chargeState: 'paid',
            amount,
            priceDigest: args.priceDigest,
            transactionRef: args.transactionRef,
            providerNet: { currency: amount.currency, units: '1', exponent: amount.exponent },
            rake: { currency: amount.currency, units: '1', exponent: amount.exponent },
            usageRef: 'usage:brokered-result',
            observedAt: now,
            }
          }
        case 'moneyLedger:releaseBrokeredInvocationCharge':
          state.reconciliations.push(args)
          return { kind: 'released', transactionRef: args.transactionRef }
        case 'moneyLedger:markBrokeredInvocationChargeOutcomeUnknown':
          state.unknownCharges.push(args)
          return { kind: 'outcome_unknown', transactionRef: args.transactionRef }
        case 'moneyLedger:reconcileInvocationCharge':
          state.reconciliations.push(args)
          if (options.reconcileRefused) return { kind: 'reconciliation_required' }
          if (options.reconcileNone) return { kind: 'none' }
          return { kind: 'settled' }
        case 'moneyLedger:markChargeOutcomeUnknown':
          state.unknownCharges.push(args)
          return { kind: 'outcome_unknown', transactionRef: args.transactionRef }
        case 'moneyLedger:reserveExternalInvocationSpend': {
          const { observedAt, ...facts } = args
          const identity = mintExternalSpendIdentity(facts as ExternalSpendPaymentFacts)
          return {
            kind: 'accepted',
            status: 'reserved',
            replayed: false,
            reservation: {
              ...identity,
              identityDigest: externalSpendIdentityDigest(identity),
              state: 'reserved',
              budgetPolicyRef: 'budget:test-worker',
              budgetDayStart: '1970-01-01',
              budgetMonthStart: '1970-01',
              evidenceRefs: [],
              createdAt: observedAt,
              updatedAt: observedAt,
            },
          }
        }
        case 'moneyLedger:finalizeExternalInvocationSpend':
          return args.settlementStatus === 'unknown'
            ? { kind: 'reconciliation_required' }
            : {
                kind: 'accepted',
                status: args.settlementStatus === 'settled' ? 'settled' : 'released',
                replayed: false,
              }
        case 'moneyLedger:reverseExternalInvocationSpendForInvalidOutput':
          if (options.invalidOutputTransitionResult === 'throw') {
            throw new Error('external_spend_transition_unavailable')
          }
          if (options.invalidOutputTransitionResult === 'refused') {
            return { kind: 'refused', code: 'external_spend_reconciliation_required' }
          }
          return { kind: 'accepted', status: 'reversed', replayed: false }
        case 'moneyLedger:recordBrokeredInvalidOutputLoss':
          if (options.invalidOutputLossResult === 'throw') {
            throw new Error('brokered_invalid_output_loss_unavailable')
          }
          if (options.invalidOutputLossResult === 'refused') {
            return { kind: 'refused', code: 'charge_reconciliation_required', retryable: false }
          }
          return {
            kind: 'settled',
            chargeTransactionRef: String(args.transactionRef),
            lossTransactionRef: `operation-money-loss:${String(args.invocationRef)}:${String(args.attemptRef)}:1`,
          }
        case 'moneyX402PaymentAttempts:claimX402PaymentAuthorization': {
          const requestFingerprint = args.requestFingerprint
          const authorization = state.payment.authorization
          if (typeof requestFingerprint !== 'string') throw new Error('x402_payment_request_fingerprint_conflict')
          if (authorization.requestFingerprint !== undefined
            && authorization.requestFingerprint !== requestFingerprint) {
            throw new Error('x402_payment_request_fingerprint_conflict')
          }
          if (state.payment.mark !== undefined) {
            throw new Error('x402_payment_attempt_reconciliation_required')
          }
          if (authorization.paymentUnsignedMaterialJson !== undefined
            && authorization.paymentUnsignedMaterialDigest !== undefined
            && authorization.paymentSigningIdempotencyKey !== undefined
            && authorization.paymentSignatureDigest !== undefined
            && authorization.paymentPayer !== undefined
            && authorization.paymentNonce !== undefined
            && authorization.paymentAuthorizationValidBefore !== undefined
            && authorization.paymentAuthorizationExpiresAt !== undefined) {
            return {
              kind: 'stored',
              paymentUnsignedMaterialJson: authorization.paymentUnsignedMaterialJson,
              paymentUnsignedMaterialDigest: authorization.paymentUnsignedMaterialDigest,
              paymentSigningIdempotencyKey: authorization.paymentSigningIdempotencyKey,
              paymentSignatureDigest: authorization.paymentSignatureDigest,
              paymentPayer: authorization.paymentPayer,
              paymentNonce: authorization.paymentNonce,
              paymentAuthorizationValidBefore: authorization.paymentAuthorizationValidBefore,
              paymentAuthorizationExpiresAt: authorization.paymentAuthorizationExpiresAt,
              requestFingerprint: authorization.requestFingerprint ?? requestFingerprint,
            }
          }
          if (authorization.claimed
            || authorization.paymentUnsignedMaterialJson !== undefined
            || authorization.paymentUnsignedMaterialDigest !== undefined
            || authorization.paymentSigningIdempotencyKey !== undefined
            || authorization.paymentSignatureDigest !== undefined
            || authorization.paymentPayer !== undefined
            || authorization.paymentNonce !== undefined
            || authorization.paymentAuthorizationValidBefore !== undefined
            || authorization.paymentAuthorizationExpiresAt !== undefined) {
            return { kind: 'pending' }
          }
          authorization.claimed = true
          authorization.requestFingerprint = requestFingerprint
          return { kind: 'claimed' }
        }
        case 'moneyX402PaymentAttempts:prepareX402PaymentAuthorization':
          state.payment.prepare = args
          if (typeof args.requestFingerprint === 'string')
            state.payment.authorization.requestFingerprint = args.requestFingerprint
          else delete state.payment.authorization.requestFingerprint
          if (options.preparePaymentErrorState !== undefined) {
            throw new Error('x402_payment_attempt_reconciliation_required')
          }
          return {
            custodyRef: 'custody:test-worker',
            authorizationDigest: digest('p'),
            ...(args.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: args.custodyBudgetRef }),
            ...(args.custodyGeneration === undefined ? {} : { custodyGeneration: args.custodyGeneration }),
            ...(args.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: args.custodyDailyMaximumUnits }),
          }
        case 'moneyX402PaymentAttempts:markX402PaymentPossiblySubmitted':
          state.payment.mark = args
          return null
        case 'moneyX402PaymentAttempts:observeX402PaymentAttempt':
          state.payment.observe = args
          return null
        case 'moneyX402PaymentAttempts:recordX402PaymentObservation':
          if (options.failPaymentObservation) throw new Error('payment_observation_unavailable')
          return null
        case 'moneyX402PaymentAttempts:recordX402PaymentSigningIntent':
          if (typeof args.requestFingerprint === 'string'
            && state.payment.authorization.requestFingerprint !== undefined
            && args.requestFingerprint !== state.payment.authorization.requestFingerprint) {
            throw new Error('x402_payment_request_fingerprint_conflict')
          }
          state.payment.authorization.paymentUnsignedMaterialJson = args.paymentUnsignedMaterialJson as string
          state.payment.authorization.paymentUnsignedMaterialDigest = args.paymentUnsignedMaterialDigest as string
          state.payment.authorization.paymentSigningIdempotencyKey = args.paymentSigningIdempotencyKey as string
          state.payment.authorization.paymentPayer = args.paymentPayer as string
          state.payment.authorization.paymentNonce = args.paymentNonce as string
          state.payment.authorization.paymentAuthorizationValidBefore = args.paymentAuthorizationValidBefore as string
          state.payment.authorization.paymentAuthorizationExpiresAt = args.paymentAuthorizationExpiresAt as number
          state.payment.authorization.requestFingerprint = args.requestFingerprint as string
          return null
        case 'moneyX402PaymentAttempts:recordX402PaymentSignatureDigest':
          if (typeof args.requestFingerprint === 'string'
            && state.payment.authorization.requestFingerprint !== undefined
            && args.requestFingerprint !== state.payment.authorization.requestFingerprint) {
            throw new Error('x402_payment_request_fingerprint_conflict')
          }
          if (typeof args.paymentSignatureDigest === 'string') {
            state.payment.authorization.paymentSignatureDigest = args.paymentSignatureDigest
          }
          if (typeof args.paymentPayer === 'string') {
            state.payment.authorization.paymentPayer = args.paymentPayer
          }
          if (typeof args.paymentNonce === 'string') {
            state.payment.authorization.paymentNonce = args.paymentNonce
          }
          if (typeof args.requestFingerprint === 'string') {
            state.payment.authorization.requestFingerprint = args.requestFingerprint
          }
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

beforeEach(() => {
  mocks.claimCanonicalInvocation.mockReset()
  mocks.persistCanonicalReleaseFence.mockReset()
  mocks.persistCanonicalTerminalOutcome.mockReset()
  mocks.prepareRegisteredRouteTransportInvocation.mockReset()
  mocks.invokePreparedRouteTransport.mockReset()
  mocks.signRouteTransportCall.mockClear()
  mocks.createCdpEvmX402PaymentSignature.mockClear()
  mocks.createSandboxEvmX402PaymentSignature.mockClear()
  mocks.cdpX402RequestFingerprint.mockClear()
  mocks.readCdpX402PaymentAuthorization.mockClear()
  mocks.credentialFromEnvironment.mockClear()
  mocks.x402PaymentCredentialRefFromEnvironment.mockClear()
  mocks.cdpX402CustodyConfigurationFromEnvironment.mockClear()
  mocks.cdpX402CustodyBudgetRef.mockClear()
  mocks.createGuardedLookup.mockReset()
  mocks.isPublicHttpTarget.mockReset()
  mocks.guardedFetch.mockReset()
  vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'route-call-signing-secret-with-at-least-32-bytes')
  vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
  vi.stubEnv('AE_TEST_PROVIDER_CREDENTIAL', '0xprovider-secret')
  vi.stubEnv('AE_X402_PAYMENT_CREDENTIAL_REF', paymentCredentialRef)
  vi.stubEnv('AE_TEST_PAYMENT_CREDENTIAL', '0xpayer-secret')
})

export { mocks }
