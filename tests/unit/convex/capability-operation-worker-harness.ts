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
  const invokeProviderConsequenceViaVercel = vi.fn()
  const providerConsequenceX402PaymentCustodyAvailable = vi.fn(() => (
    /^sec_[0-9a-f]{32}$/u.test(process.env.AE_X402_PAYMENT_SECRET_REF?.trim() ?? '')
  ))
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
  const createSandboxEvmX402PaymentSignature = vi.fn(async (_request: unknown) => 'signed:payment')
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
    invokeProviderConsequenceViaVercel,
    providerConsequenceX402PaymentCustodyAvailable,
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

vi.mock('@/modules/action-invocation/runtime', async (importOriginal) => {
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
vi.mock('@/modules/capability-execution/invocation-worker/providerConsequenceBridge', () => ({
  invokeProviderConsequenceViaVercel: mocks.invokeProviderConsequenceViaVercel,
  providerConsequenceX402PaymentCustodyAvailable: mocks.providerConsequenceX402PaymentCustodyAvailable,
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
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  connectionAuthoritySnapshotFromProviderConnection,
  createPublicOperationRef,
  materializeRuntimePublishedOperation,
} from '@/modules/capability-supply/public'
import { createX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
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
import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
} from '@/modules/capability-execution'

export const invocationRef = 'operation-invocation:test-worker'
export const grantRef = 'grant:test-worker'
const providerCredentialRef = 'env:AE_TEST_PROVIDER_CREDENTIAL'
export const paymentCredentialRef = 'env:AE_TEST_PAYMENT_CREDENTIAL'
export const paymentSecretRef = `sec_${'4'.repeat(32)}`
export const attemptRef = `operation-attempt:${invocationRef}:1`
export const digest = (digit: string) => `sha256:${digit.repeat(64)}`

type WorkerKind = 'x402' | 'http'
type WorkerOptions = Readonly<{
  environment?: 'sandbox' | 'production'
  operatorAccountVersion?: number | null
  priceUnits?: string
  actualOperatorAccountVersion?: number
  releaseFenceResult?: Readonly<{ kind: 'applied' }> | Readonly<{ kind: 'refused' }>
  finalGrant?: Readonly<Record<string, unknown>> | null
  signingBoundaryGrant?: Readonly<Record<string, unknown>> | null
  signingBoundaryProviderAuthority?: 'invalid' | 'throw'
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
  releaseCurrentOperation?: (operation: PublishedOperation) => PublishedOperation
  authorizationCurrentOperation?: (operation: PublishedOperation) => PublishedOperation
  alreadyLeased?: boolean
  claimDispatchRefused?: boolean
  activeCharge?: Readonly<Record<string, unknown>>
  stalePrincipal?: boolean
  paymentSigningClaim?: 'expired' | 'unexpired'
  sellerCanary?: boolean
  sellerPayTo?: string
}>
type PaymentState = {
  prepare: Record<string, unknown> | undefined
  read: Record<string, unknown> | undefined
  mark: Record<string, unknown> | undefined
  observe: Record<string, unknown> | undefined
  authorization: {
    claimed: boolean
    paymentSigningClaimedAt?: number
    paymentUnsignedMaterialJson?: string
    paymentUnsignedMaterialDigest?: string
    paymentSigningIdempotencyKey?: string
    paymentSignatureDigest?: string
    paymentPayer?: string
    paymentNonce?: string
    paymentAuthorizationValidBefore?: string
    paymentAuthorizationExpiresAt?: number
    requestFingerprint?: string
    authorizationFailureCode?: string
    authorizationFailureDetail?: string
    authorizationFailureObservedAt?: number
  }
}
type WorkerState = {
  dispatch: Record<string, unknown>
  operation: PublishedOperation
  money: Record<string, unknown> | undefined
  payment: PaymentState
  transportCalls: number
  events: string[]
  queryCalls: string[]
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
      authority: { kind: 'public_upstream' },
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

function sealCurrentOperation(operation: PublishedOperation): PublishedOperation {
  const operationRef = createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  const connectionAuthority = operation.connectionAuthority === undefined
    ? undefined
    : { ...operation.connectionAuthority, operationRef }
  const { connectionAuthority: _oldIdentityAuthority, ...identityBase } = operation.identity
  const identity = {
    ...identityBase,
    offeringDigest: capabilityOfferingRegistrationHash(operation.offering),
    bindingDigest: capabilityBindingRegistrationHash(operation.binding, operation.transport),
    runtimeEnvironment: operation.runtimeEnvironment,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority: { ...connectionAuthority } }),
  }
  return {
    ...operation,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
    identity,
    materialDigest: canonicalDigest(identity as StableHashValue),
  }
}

function withCredentiallessX402Connection(
  operation: PublishedOperation,
  observedAt: number,
): PublishedOperation {
  const endpoint = new URL(operation.binding.endpointUrl).toString()
  const host = new URL(endpoint).host.toLowerCase()
  const connectionRef = 'connection:x402:test-worker'
  const providerRef = `provider:x402:${host}`
  const created = createX402ProviderConnection({
    commandId: 'command:x402:test-worker',
    connectionRef,
    owningAccountRef: 'account:test-worker',
    installedByPrincipalRef: 'principal:test-worker',
    authorityGrantRef: 'grant:test-worker',
    authorityGrantGeneration: 1,
    businessId: operation.identity.businessId,
    providerRef,
    providerAccountRef: `x402:${endpoint}`,
    resourceUrl: endpoint,
    evidenceRefs: ['evidence:x402:test-worker'],
  }, observedAt)
  if (created.kind !== 'applied') throw new Error('credentialless_x402_worker_fixture_invalid')
  const operationRef = createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  const connectionAuthority = connectionAuthoritySnapshotFromProviderConnection(
    created.connection,
    operationRef,
  )
  return {
    ...operation,
    binding: {
      ...operation.binding,
      authority: { kind: 'provider_connection', connectionRef, providerRef },
    },
    connectionAuthority,
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
  const x402Profile = environment === 'production'
    ? { network: BASE_MAINNET_NETWORK, asset: BASE_MAINNET_USDC_ADDRESS }
    : { network: BASE_SEPOLIA_NETWORK, asset: BASE_SEPOLIA_USDC_ADDRESS }
  const environmentOperation = inRuntimeEnvironment(
    kind === 'x402' && baseOperation.identity.payment.kind === 'x402'
      ? {
          ...baseOperation,
          identity: {
            ...baseOperation.identity,
            payment: {
              ...baseOperation.identity.payment,
              ...x402Profile,
              ...(options.sellerPayTo === undefined
                ? options.sellerCanary === true
                  ? { payTo: '0x0000000000000000000000000000000000000002' }
                  : {}
                : { payTo: options.sellerPayTo }),
            },
          },
        }
      : baseOperation,
    environment,
  )
  const operation = sealCurrentOperation(
    options.sellerCanary === true && kind === 'x402'
      ? withCredentiallessX402Connection(environmentOperation, now)
      : environmentOperation,
  )
  const operationRef = createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  const operatorAccountVersion = options.operatorAccountVersion === undefined
    ? 0
    : options.operatorAccountVersion
  const actualOperatorAccountVersion = options.actualOperatorAccountVersion
    ?? (operatorAccountVersion === null ? 0 : operatorAccountVersion)

  const descriptor = materializeRuntimePublishedOperation(operation)
  const input = { symbol: 'BTC', convert: 'USD' }
  const inputDigest = canonicalDigest(input as StableHashValue)
  const authorityExpiresAt = new Date(now + 60_000).toISOString()
  const acceptedBasis = { kind: 'approve_each' as const, authorityRef: `authority:${invocationRef}` }
  const limits = { amount: descriptor.price.kind === 'fixed' ? descriptor.price.amount : { currency: 'USD', units: '1', exponent: 2 } }
  const authorityMaterial = {
    invocationRef,
    operationRef,
    inputDigest,
    grantRef,
    grantGeneration: 1,
    grantDigest: digest('a'),
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
  const currentOperation = sealCurrentOperation(options.currentOperation?.(operation) ?? operation)
  const releaseCurrentOperation = sealCurrentOperation(
    options.releaseCurrentOperation?.(currentOperation) ?? currentOperation,
  )
  const authorizationCurrentOperation = sealCurrentOperation(
    options.authorizationCurrentOperation?.(releaseCurrentOperation) ?? releaseCurrentOperation,
  )
  const inputJson = JSON.stringify(input)
  const dispatch: Record<string, unknown> = {
    invocationRef,
    principalId: 'principal:test-worker',
    ownerId: 'owner:test-worker',
    credentialId: 'credential:test-worker',
    applicationRef: 'application:test-worker',
    environment,
    state: 'pending',
    operationRef,
    idempotencyKey: 'idempotency:test-worker',
    inputDigest,
    requestDigest: digest('r'),
    grantRef,
    grantGeneration: 1,
    policyDigest: digest('a'),
    grantExpiresAt: now + 90_000,
    operationJson,
    inputJson,
    workId: 'work:test-worker',
    dispatchState: 'enqueued',
    authority,
  }
  const sellerCanary = options.sellerCanary === true
    ? sellerOnboardingCanaryExecutionEnvelope(createSellerOnboardingCanaryCommitment({
        ownerId: 'seller-owner:test-worker',
        businessId: operation.identity.businessId,
        offeringRef: 'offering:test-worker',
        offeringRevision: 1,
        offeringSourceHash: digest('1'),
        accessPathRef: 'access-path:test-worker',
        accessPathSourceHash: digest('2'),
        publicationRef: operation.identity.publicationRef,
        publicationRevision: operation.identity.publicationRevision,
        draftOperationRef: operationRef,
        operationMaterialDigest: operation.materialDigest,
        contractDigest: operation.identity.contractDigest,
        bindingDigest: operation.identity.bindingDigest,
        priceDigest: operation.priceDigest,
        sellerPayTo: operation.identity.payment.kind === 'x402'
          ? operation.identity.payment.payTo
          : '0x0000000000000000000000000000000000000000',
        sellerClaimDigest: digest('3'),
        readinessDigest: digest('4'),
        readinessObservedAt: operation.readiness.observedAt,
        readinessValidUntil: operation.readiness.validUntil,
        expectedOutputSchemaDigest: canonicalDigest(operation.contract.outputSchema as StableHashValue),
        expectedOutputEvidenceDigest: canonicalDigest({
          kind: 'seller_onboarding_canary_expected_output:v1',
          operationMaterialDigest: operation.materialDigest,
          contractDigest: operation.identity.contractDigest,
          inputDigest,
          outputSchema: operation.contract.outputSchema,
          evidence: operation.contract.evidence,
        } as StableHashValue),
        inputDigest,
        idempotencyKey: String(dispatch.idempotencyKey),
        fundingBudgetRef: 'budget:test-worker',
        fundingPrincipalId: String(dispatch.principalId),
        fundingOwnerId: String(dispatch.ownerId),
        fundingCredentialId: String(dispatch.credentialId),
        fundingApplicationRef: String(dispatch.applicationRef),
        fundingGrantRef: grantRef,
        fundingGrantGeneration: 1,
        fundingPolicyDigest: digest('a'),
        requestedSpend: descriptor.price.kind === 'fixed'
          ? descriptor.price.amount
          : { currency: 'USD', units: '1', exponent: 2 },
        maximumSpend: descriptor.price.kind === 'fixed'
          ? descriptor.price.amount
          : { currency: 'USD', units: '1', exponent: 2 },
        expiresAt: now + 60_000,
        now,
      }))
    : undefined
  if (sellerCanary !== undefined) {
    dispatch.sellerOnboardingCanary = sellerCanary
    dispatch.invocationRef = sellerCanary.invocationRef
    const canaryAuthorityMaterial = {
      ...authorityMaterial,
      invocationRef: sellerCanary.invocationRef,
    }
    dispatch.authority = {
      ...canaryAuthorityMaterial,
      decisionDigest: canonicalDigest({
        format: 'operation-invoke-authority:v1',
        ...canaryAuthorityMaterial,
      } as StableHashValue),
    }
  }
  const managedCustody = environment === 'production' || sellerCanary !== undefined
  const paymentIdentifier = operationInvocationAttemptIdentityDigest({
    invocationRef: String(dispatch.invocationRef),
    principalId: 'principal:test-worker',
    credentialId: 'credential:test-worker',
    applicationRef: 'application:test-worker',
    environment,
    operationRef,
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
    policyDigest: digest('a'),
    expiresAt: now + 90_000,
  }
  const connectionAuthority = operation.connectionAuthority
  const providerAuthority = connectionAuthority === undefined || sellerCanary !== undefined ? undefined : {
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
    authorization: {
      claimed: options.paymentSigningClaim !== undefined,
      ...(options.paymentSigningClaim === undefined
        ? {}
        : {
            paymentSigningClaimedAt: options.paymentSigningClaim === 'expired'
              ? now - 120_000
              : now,
          }),
    },
  }
  const state: WorkerState = {
    dispatch,
    operation,
    money: options.activeCharge === undefined ? undefined : { ...options.activeCharge },
    payment,
    transportCalls: 0,
    events: [],
    queryCalls: [],
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
      ...(authorization.paymentSigningClaimedAt === undefined
        ? {}
        : { paymentSigningClaimedAt: authorization.paymentSigningClaimedAt }),
      ...(authorization.authorizationFailureCode === undefined
        ? {}
        : { authorizationFailureCode: authorization.authorizationFailureCode }),
      ...(authorization.authorizationFailureDetail === undefined
        ? {}
        : { authorizationFailureDetail: authorization.authorizationFailureDetail }),
      ...(authorization.authorizationFailureObservedAt === undefined
        ? {}
        : { authorizationFailureObservedAt: authorization.authorizationFailureObservedAt }),
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
    if (kind !== 'x402') {
      await runtime.send(new URL(operation.binding.endpointUrl), { method: 'POST' })
      return options.observation ?? {
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest: digest('c'),
        outputJson: successfulOutputJson,
      }
    }
    {
      if (operation.identity.payment.kind !== 'x402') throw new Error('x402 operation payment missing')
      const validateCredentiallessBoundary = async (): Promise<void> => {
        if (sellerCanary === undefined) return
        const validate = runtime.validateProviderConnectionAuthority
        const current = operation.connectionAuthority
        if (validate === undefined || current === undefined) {
          throw new Error('credentialless_x402_authority_validator_missing')
        }
        const validation = await validate({
          connectionRef: current.connectionRef,
          providerRef: current.providerRef,
          adapterId: current.adapterId,
          authorityGeneration: current.authorityGeneration,
          authorityDigest: current.authorityDigest,
        })
        if (validation.kind !== 'valid') throw new Error('credentialless_x402_authority_invalid')
      }
      await validateCredentiallessBoundary()
      const challenge = {
        x402Version: 2 as const,
        resource: { url: operation.binding.endpointUrl },
        accepts: [{
          scheme: 'exact',
          network: x402Profile.network,
          amount: '10000',
          asset: x402Profile.asset,
          payTo: operation.identity.payment.payTo,
          maxTimeoutSeconds: 60,
          extra: {},
        }],
      }
      await validateCredentiallessBoundary()
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
      if (managedCustody) {
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
      const beforeX402PaymentAuthorizationRead = runtime.beforeX402PaymentAuthorizationRead
      if (managedCustody) {
        if (beforeX402PaymentAuthorizationRead === undefined) {
          throw new Error('x402 release fence callback missing')
        }
        state.events.push('fence-callback')
        if (!await beforeX402PaymentAuthorizationRead()) {
          throw new Error('x402 release fence refused')
        }
      }
      state.events.push('authorization-read')
      const signed = await runtime.readX402PaymentAuthorization(prepared)
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
      await validateCredentiallessBoundary()
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
      state.events.push('send')
      await runtime.send(new URL(operation.binding.endpointUrl), {
        method: 'POST',
        headers: { 'Payment-Signature': signed },
      })
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
    return options.observation ?? {
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
          network: x402Profile.network,
          amount: '10000',
        },
        digest: digest('s'),
      },
    }
  })
  const chargeAmount = descriptor.price.kind === 'fixed'
    ? descriptor.price.amount
    : { currency: 'USD', units: '0', exponent: 2 }
  const chargeState: 'free_tier' | 'paid' = chargeAmount.units === '0' ? 'free_tier' : 'paid'
  let activeGrantReads = 0
  let currentOperationReads = 0
  const sellerCanarySnapshot = (candidate: PublishedOperation) => ({
    operationJson: JSON.stringify(candidate),
    operationRef,
    offeringRef: sellerCanary?.offeringRef ?? 'offering:test-worker',
    offeringRevision: sellerCanary?.offeringRevision ?? 1,
    offeringSourceHash: sellerCanary?.offeringSourceHash ?? digest('1'),
    accessPathRef: sellerCanary?.accessPathRef ?? 'access-path:test-worker',
    accessPathSourceHash: sellerCanary?.accessPathSourceHash ?? digest('2'),
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    sellerPayTo: operation.identity.payment.kind === 'x402'
      ? operation.identity.payment.payTo
      : '0x0000000000000000000000000000000000000000',
    sellerClaimDigest: sellerCanary?.sellerClaimDigest ?? digest('3'),
    readinessDigest: sellerCanary?.readinessDigest ?? digest('4'),
    readinessObservedAt: candidate.readiness.observedAt,
    readinessValidUntil: candidate.readiness.validUntil,
  })

  const ctx = {
    runQuery: vi.fn(async (reference: unknown, args?: Record<string, unknown>) => {
      const queryPath = functionPath(reference)
      state.queryCalls.push(queryPath)
      switch (queryPath) {
        case 'capabilityOperationInvocations:openDispatch': return dispatch
        case 'agentAccessPrincipals:getAgentPrincipal': return principal
        case 'capabilitySupplyCanaryFunding:readExactSellerOnboardingCanaryPlatformGrant': return grant
        case 'agentAccessPolicy:readActiveGrant':
          activeGrantReads += 1
          if (activeGrantReads === 2) state.events.push('final-grant-revalidation')
          if (activeGrantReads > 2 && options.signingBoundaryGrant !== undefined) return options.signingBoundaryGrant
          return activeGrantReads > 1 && options.finalGrant !== undefined ? options.finalGrant : grant
        case 'capabilitySupplyOperations:readCurrentPublishedOperationSnapshot':
          currentOperationReads += 1
          if (currentOperationReads === 2) state.events.push('current-publication-price-revalidation')
          return {
            operationJson: JSON.stringify(
              currentOperationReads === 1 ? currentOperation : releaseCurrentOperation,
            ),
          }
        case 'capabilitySupplyCurrentOperation:readExactSellerCanaryOperationSnapshot':
          currentOperationReads += 1
          if (currentOperationReads === 2) state.events.push('current-publication-price-revalidation')
          return sellerCanarySnapshot(
            currentOperationReads === 1
              ? currentOperation
              : currentOperationReads < 3
                ? releaseCurrentOperation
                : authorizationCurrentOperation,
          )
        case 'moneyLedger:readOperatorAccountVersion': return operatorAccountVersion
        case 'capabilityOperationInvocations:readCurrentProviderConnectionAuthority':
          return sellerCanary === undefined
            ? { kind: 'credentialed' }
            : { kind: 'credentialless_x402' }
        case 'capabilityOperationInvocations:readProviderLeaseAuthority':
          if (state.payment.prepare !== undefined) {
            if (options.signingBoundaryProviderAuthority === 'throw') {
              throw new Error('provider_authority_read_unavailable')
            }
            if (options.signingBoundaryProviderAuthority === 'invalid') return null
          }
          return providerAuthority
        case 'actionInvocationControl:readControl': return canonicalClaimed ? canonicalControl : undefined
        case 'actionInvocationControl:readAttempt': return canonicalClaimed ? canonicalAttempt : undefined
        case 'capabilityProviderConnections:resolveLeaseCredentialRef': return { kind: 'resolved', credentialRef: providerCredentialRef }
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
        default: throw new Error(`unexpected_query:${queryPath}:${JSON.stringify(args)}`)
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
            connectionRef: `con_${'3'.repeat(32)}`,
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
          state.events.push('buyer-reserve')
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
          state.events.push('custody-reserve')
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
          if (authorization.claimed && options.paymentSigningClaim !== 'expired'
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
          authorization.paymentSigningClaimedAt = Date.now()
          authorization.requestFingerprint = requestFingerprint
          return { kind: 'claimed' }
        }
        case 'moneyX402PaymentAttempts:prepareX402PaymentAuthorization':
          state.events.push('custody-prepare')
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
          state.events.push('mark-possibly-submitted')
          state.payment.mark = args
          return null
        case 'moneyX402PaymentAttempts:observeX402PaymentAttempt':
          state.payment.observe = args
          return null
        case 'moneyX402PaymentAttempts:recordX402PaymentObservation':
          if (options.failPaymentObservation) throw new Error('payment_observation_unavailable')
          return null
        case 'moneyX402PaymentAttempts:recordX402PaymentSigningIntent':
          if (managedCustody) state.events.push('authorization-sign')
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
        case 'moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure':
          state.payment.authorization.authorizationFailureCode = args.code as string
          if (typeof args.detail === 'string') {
            state.payment.authorization.authorizationFailureDetail = args.detail
          } else {
            delete state.payment.authorization.authorizationFailureDetail
          }
          state.payment.authorization.authorizationFailureObservedAt = Date.now()
          state.events.push('authorization-failure-recorded')
          return null
        case 'qualifiedUse:recordQualifiedUse':
          state.qualifiedUse.push(args)
          return args.environment === 'production'
            ? { kind: 'recorded' }
            : { kind: 'excluded', reason: 'non_production_environment' }
        case 'capabilityOperationInvocations:reconcileInvocationWorkloadAuthority':
          return {
            kind: 'authorized',
            authority: {
              principalId: state.dispatch.principalId,
              accountRef: state.dispatch.ownerId,
              credentialId: state.dispatch.credentialId,
              grantRef: state.dispatch.grantRef,
              grantGeneration: state.dispatch.grantGeneration,
              policyDigest: state.dispatch.policyDigest,
              expiresAt: state.dispatch.grantExpiresAt,
            },
          }
        default: throw new Error(`unexpected_mutation:${path}:${JSON.stringify(args)}`)
      }
    }),
  }
  mocks.invokeProviderConsequenceViaVercel.mockImplementation(async (bridgeCtx: unknown, input: {
    invocation: RouteTransportInvocation
    requestDigest: string
  }) => {
    if (kind !== 'x402') {
      state.transportCalls += 1
      return options.observation ?? {
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest: input.requestDigest,
        outputJson: successfulOutputJson,
      }
    }
    const payerSecretRef = process.env.AE_X402_PAYMENT_SECRET_REF?.trim()
    if (payerSecretRef === undefined || !/^sec_[0-9a-f]{32}$/u.test(payerSecretRef)) {
      return {
        transport: 'x402',
        disposition: 'refused',
        releaseStarted: false,
        requestDigest: input.requestDigest,
        failureCode: 'payment_custody_unavailable',
      }
    }
    const runMutation = (bridgeCtx as { runMutation: (reference: string, args: Record<string, unknown>) => Promise<unknown> }).runMutation
    const connection = input.invocation.binding.authority
    const providerRef = connection.kind === 'provider_connection' ? connection.providerRef : 'provider:test-worker'
    const reserved = await runMutation('moneyLedger:reserveExternalInvocationSpend', {
      principalId: dispatch.principalId,
      credentialId: dispatch.credentialId,
      grantRef: dispatch.grantRef,
      grantGeneration: dispatch.grantGeneration,
      environment: dispatch.environment,
      invocationRef: dispatch.invocationRef,
      operationRef: dispatch.operationRef,
      attemptRef,
      effectGeneration: 1,
      providerRef,
      paymentIdentifier: input.invocation.authority.operationKeyDigest,
      challengeDigest: digest('a'),
      amount: { currency: 'USD', units: '1', exponent: 2 },
      observedAt: now,
    })
    const reservation = reserved as { reservation?: { reservationRef?: string } }
    if (operation.identity.payment.kind !== 'x402') throw new Error('x402 operation payment missing')
    const challenge = {
      x402Version: 2,
      resource: { url: input.invocation.binding.endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: x402Profile.network,
        amount: '10000',
        asset: x402Profile.asset,
        payTo: operation.identity.payment.payTo,
        maxTimeoutSeconds: 60,
        extra: {},
      }],
    }
    try {
      const preparedAuthorization = await runMutation('moneyX402PaymentAttempts:prepareX402PaymentAuthorization', {
        dispatchRef: dispatch.invocationRef,
        operationRef: dispatch.operationRef,
        inputDigest: dispatch.inputDigest,
        attemptRef,
        effectGeneration: 1,
        paymentIdentifier: input.invocation.authority.operationKeyDigest,
        operationKeyDigest: input.invocation.authority.operationKeyDigest,
        challengeDigest: digest('a'),
        challengeJson: JSON.stringify(challenge),
        selectedRequirementJson: JSON.stringify(challenge.accepts[0]),
        providerEndpoint: input.invocation.binding.endpointUrl,
        scheme: 'exact',
        network: x402Profile.network,
        asset: x402Profile.asset,
        payTo: operation.identity.payment.payTo,
        amountUnits: '1',
        currency: 'USD',
        exponent: 2,
        credentialRef: payerSecretRef,
        reservationRef: reservation.reservation?.reservationRef,
      })
      const paymentSignature = await mocks.createSandboxEvmX402PaymentSignature({
        challenge,
        selectedRequirement: challenge.accepts[0],
        paymentIdentifier: input.invocation.authority.operationKeyDigest,
        credential: 'callback-scoped-test-secret',
      })
      return await mocks.invokePreparedRouteTransport(
        { requestDigest: input.requestDigest },
        {
          readX402PaymentCredentialRef: async () => payerSecretRef,
          prepareX402PaymentAuthorization: async () => preparedAuthorization,
          readX402PaymentAuthorization: async () => paymentSignature,
          readX402PaymentAuthorizationByDigest: async () => paymentSignature,
          markX402PaymentPossiblySubmitted: async (event: Record<string, unknown>) => {
            await runMutation('moneyX402PaymentAttempts:markX402PaymentPossiblySubmitted', {
              ...event,
              dispatchRef: dispatch.invocationRef,
              effectGeneration: 1,
            })
          },
          observeX402PaymentAttempt: async (event: Record<string, unknown>) => {
            await runMutation('moneyX402PaymentAttempts:observeX402PaymentAttempt', {
              ...event,
              dispatchRef: dispatch.invocationRef,
              effectGeneration: 1,
            })
          },
          verifyX402Settlement: async () => true,
          send: async () => new Response('{}', { status: 200 }),
        },
      )
    } catch {
      if (options.preparePaymentErrorState !== 'possibly_submitted') throw new Error('unexpected_prepare_failure')
      await runMutation('moneyLedger:finalizeExternalInvocationSpend', {
        principalId: dispatch.principalId,
        credentialId: dispatch.credentialId,
        grantRef: dispatch.grantRef,
        grantGeneration: dispatch.grantGeneration,
        environment: dispatch.environment,
        invocationRef: dispatch.invocationRef,
        operationRef: dispatch.operationRef,
        attemptRef,
        effectGeneration: 1,
        providerRef,
        paymentIdentifier: input.invocation.authority.operationKeyDigest,
        challengeDigest: digest('a'),
        amount: { currency: 'USD', units: '1', exponent: 2 },
        reservationRef: reservation.reservation?.reservationRef,
        submissionStatus: 'unknown',
        settlementStatus: 'unknown',
        evidenceRefs: ['evidence:test-worker:bridge-unknown'],
        observedAt: now,
      })
      return {
        transport: 'x402',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: input.requestDigest,
        paymentAuthorizationStatus: 'unknown',
        paymentSubmissionStatus: 'unknown',
        settlementEvidence: { kind: 'unknown', reason: 'payment_attempt_reconciliation_required' },
        failureCode: 'payment_attempt_reconciliation_required',
      }
    }
  })
  return { ctx, state }
}

beforeEach(() => {
  mocks.claimCanonicalInvocation.mockReset()
  mocks.persistCanonicalReleaseFence.mockReset()
  mocks.persistCanonicalTerminalOutcome.mockReset()
  mocks.prepareRegisteredRouteTransportInvocation.mockReset()
  mocks.invokePreparedRouteTransport.mockReset()
  mocks.invokeProviderConsequenceViaVercel.mockReset()
  mocks.providerConsequenceX402PaymentCustodyAvailable.mockClear()
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
  vi.stubEnv('AE_X402_PAYMENT_SECRET_REF', paymentSecretRef)
  vi.stubEnv('AE_X402_PAYMENT_CREDENTIAL_REF', '')
  vi.stubEnv('AE_TEST_PAYMENT_CREDENTIAL', '')
})

export { mocks }
