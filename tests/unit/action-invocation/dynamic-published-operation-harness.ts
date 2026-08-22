import { encodePaymentResponseHeader } from '@x402/core/http'
import { validatePaymentRequired } from '@x402/core/schemas'

import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  buildDynamicPublishedInput,
  materialDigest,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type DynamicPublishedInvocationResult,
  type InvocationActor,
} from '@/modules/action-invocation'
import {
  buildDevelopmentPublishedOperationEvidence,
  createDevelopmentProviderLeaseIssuer,
  developmentProviderConnectionAuthorityDigest,
} from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  createPublicOperationRef,
  defineCapabilityTransportBindingRegistration,
  materializePublishedOperation,
} from '@/modules/capability-supply/public'
import type {
  ProviderConnectionAuthorityLookup,
  RouteTransportFetch,
  RouteTransportRuntime,
  X402PaymentAuthorizationIdentity,
  X402PaymentSignatureRequest,
  X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { pricingConfigDigest, rescaleExactAmount, type ExactAmount } from '@/modules/money/public'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import {
  type DynamicPublishedPreparedTransport,
} from '@/modules/action-invocation/dynamic-published-execution'
import { createInMemoryX402PaymentAttemptPort } from '../../helpers/x402-payment-attempt'
import {
  type X402PaymentAttempt,
} from '@/modules/action-invocation/x402-payment-attempt'

export const actor: InvocationActor = { callerRef: 'agent:development', principalRef: 'principal:development' }
export const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'request:development', revision: 4 },
  { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
]

export function dynamicSnapshotAnchors(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
  prepared: ActionInvocationView<DynamicPublishedInvocationResult>,
  origin: ActionInvocationOrigin,
  status: 'pending' | 'completed' | 'uncertain',
  expectedEffectCount: number,
) {
  const material = buildDynamicPublishedInput({
    operation: fixture.operation,
    descriptor: fixture.descriptor,
    value: { symbol: 'BTC', convert: 'USD' },
  })
  return {
    operation: fixture.operation,
    descriptor: fixture.descriptor,
    actor,
    origin,
    issuedAuthority: {
      reference: prepared.authority!.reference,
      accepted: { kind: 'approve_each' as const, authorityRef: prepared.authority!.reference },
      materialInputDigest: materialDigest(
        material,
        ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
      ),
    },
    expectedEffectCount,
    expectedSemanticClaim: {
      ownerInvocationRef: prepared.invocationRef,
      status,
      ...(status === 'completed'
        ? {
            outcomeResultRef: `published-result:${canonicalDigest({
              semanticBaseKey: canonicalDigest({
                principalRef: actor.principalRef,
                actionId: fixture.operation.operationId,
                actionVersion: fixture.descriptor.version,
                operationKey: material.operationKey,
              }),
              target: material.target,
              preparedMaterialDigest: materialDigest(
                material,
                ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
              ),
            })}`,
          }
        : {}),
    },
  }
}

export function createAdapter(
  operation: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>['operation'],
  runtime: RouteTransportRuntime,
  now: number,
  source = createDevelopmentDynamicPublishedSource([operation]),
  options: Readonly<{
    durablePort?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['durablePort']
    developmentSnapshot?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['developmentSnapshot']
    initialSnapshot?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['initialSnapshot']
    sequenceBase?: number
    paymentAttemptPort?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['paymentAttemptPort']
    verifyPaymentReconciliationEvidence?: Parameters<typeof createDynamicPublishedActionInvocationAdapter>[0]['verifyPaymentReconciliationEvidence']
  }> = {},
) {
  let durablePort = options.durablePort
  let developmentSnapshot = options.developmentSnapshot
  if (durablePort === undefined) {
    const state = createDevelopmentDurableState<DynamicPublishedInvocationResult>()
    durablePort = createDevelopmentDurablePort(state)
    developmentSnapshot = state
  }
  let invocation = options.sequenceBase ?? 0
  let authority = options.sequenceBase ?? 0
  let attempt = options.sequenceBase ?? 0
  const paymentAttemptPort = options.paymentAttemptPort ?? createInMemoryX402PaymentAttemptPort()
  return createDynamicPublishedActionInvocationAdapter({
    issueProviderLease: createDevelopmentProviderLeaseIssuer(operation, now),
    operation,
    source,
    runtime,
    now: () => now,
    nextInvocationRef: () => `invocation:${++invocation}`,
    nextAuthorityRef: () => `authority:${++authority}`,
    nextAttemptRef: () => `attempt:${++attempt}`,
    durablePort,
    paymentAttemptPort,
    ...(developmentSnapshot === undefined ? {} : { developmentSnapshot }),
    ...(options.initialSnapshot === undefined ? {} : { initialSnapshot: options.initialSnapshot }),
    ...(options.verifyPaymentReconciliationEvidence === undefined
      ? {}
      : { verifyPaymentReconciliationEvidence: options.verifyPaymentReconciliationEvidence }),
  })
}

export function paymentPreparedFixture(): DynamicPublishedPreparedTransport {
  const paymentRequiredJson = stableStringify(validatePaymentRequired({
    x402Version: 2,
    resource: { url: 'https://provider.example/paid' },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '10000',
      asset: '0xmock-usdc',
      payTo: '0xmock-provider',
      maxTimeoutSeconds: 30,
      extra: {},
    }],
  }) as StableHashValue)
  const configuration = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    scheme: 'exact' as const,
    network: 'eip155:8453',
    currency: 'USD',
    routeAmountExponent: 2,
    assetAmountExponent: 6,
    asset: '0xmock-usdc',
    payTo: '0xmock-provider',
    paymentRequiredJson,
  }
  const configJson = stableStringify(configuration as StableHashValue)
  return {
    invocationRef: 'invocation:crash-cut',
    operationKey: 'operation:paid',
    attemptRef: 'attempt:one',
    effectGeneration: 3,
    plan: {
      invocation: {
        binding: {
          adapterId: 'x402-fetch:v2',
          endpointUrl: 'https://provider.example/paid',
          authority: {
            kind: 'provider_connection',
            connectionRef: 'test:connection:x402',
            providerRef: 'test:provider:x402',
          },
          configJson,
          configDigest: canonicalDigest(configuration as StableHashValue),
        },
        authority: {
          attemptRef: 'attempt:one',
          effectGeneration: 3,
          authorityGeneration: 3,
          authorityDigest: canonicalDigest({ fixture: 'test-x402-authority', generation: 3 }),
          operationKeyDigest: 'operation:paid',
          mandateDigest: 'mandate:digest',
          grantDigest: 'grant:digest',
          capabilityContractDigest: 'operation:revision',
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
          expiresAt: 10_000,
          callIdentity: { keyId: 'key:one', signature: 'call:signature' },
        },
        inputJson: '{}',
      },
      endpoint: new URL('https://provider.example/paid'),
      target: new URL('https://provider.example/paid'),
      configuration,
      requestDigest: canonicalDigest({ request: 'paid' }),
    },
  }
}

export function paymentAuthorizationRequest():
  X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity {
  const challenge = {
    x402Version: 2 as const,
    resource: { url: 'https://provider.example/paid' },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453' as const,
      amount: '10000',
      asset: '0xmock-usdc',
      payTo: '0xmock-provider',
      maxTimeoutSeconds: 30,
      extra: {},
    }],
  }
  return {
    challenge,
    challengeDigest: canonicalDigest(challenge),
    credential: 'env:AE_X402_PAYMENT_PRIVATE_KEY',
    paymentIdentifier: 'operation:paid',
    selectedRequirement: challenge.accepts[0]!,
    paymentAmount: { currency: 'USD', units: '1', exponent: 2 },
    attemptRef: 'attempt:one',
    effectGeneration: 3,
  }
}

export function paymentAttemptFixture(
  prepared: DynamicPublishedPreparedTransport,
  request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity,
): X402PaymentAttempt {
  return {
    paymentIdentifier: request.paymentIdentifier,
    invocationRef: prepared.invocationRef,
    attemptRef: prepared.attemptRef,
    effectGeneration: prepared.effectGeneration,
    operationKey: prepared.operationKey,
    challengeDigest: request.challengeDigest,
    scheme: request.selectedRequirement.scheme,
    network: request.selectedRequirement.network,
    asset: request.selectedRequirement.asset,
    payTo: request.selectedRequirement.payTo,
    amount: request.paymentAmount,
    providerEndpoint: request.challenge.resource.url,
    operationRevision: prepared.plan.invocation.authority.capabilityContractDigest,
    authorizationDigest: canonicalDigest('raw:authorization:from-custody'),
    custodyRef: `sha256:${'3'.repeat(64)}`,
    state: 'prepared',
    preparedAt: 1,
    evidenceRefs: [],
  }
}

export function successRuntime(
  endpoint: string,
  effects: { payment: number; provider: number },
  challengeAmount = '10000',
): RouteTransportRuntime {
  return runtime(endpoint, effects, JSON.stringify({
    data: {
      BTC: {
        symbol: 'BTC',
        quote: { USD: { price: 1, last_updated: '2026-07-20T00:00:00.000Z' } },
      },
    },
  }), challengeAmount)
}

export function invalidOutputRuntime(endpoint: string): RouteTransportRuntime {
  return runtime(endpoint, { payment: 0, provider: 0 }, JSON.stringify({ unexpected: true }))
}

export function lostResponseRuntime(endpoint: string, effects: { payment: number; provider: number }): RouteTransportRuntime {
  const base = runtime(endpoint, effects, '{}')
  let calls = 0
  return {
    ...base,
    send: async (url, init) => {
      calls += 1
      if (calls === 2) {
        effects.provider += 1
        throw new Error('lost_x402_response')
      }
      return await base.send(url, init)
    },
  }
}

function runtime(
  endpoint: string,
  effects: { payment: number; provider: number },
  output: string,
  challengeAmount = '10000',
): X402RouteTransportRuntime {
  const custody = new Map<string, Readonly<{
    custodyRef: string
    authorizationDigest: string
    paymentSignature: string
  }>>()
  const challenge = {
    x402Version: 2,
    resource: { url: `${endpoint}?symbol=BTC&convert=USD` },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453' as const,
      amount: challengeAmount,
      asset: '0xmock-usdc',
      payTo: '0xmock-provider-recipient',
      maxTimeoutSeconds: 30,
      extra: {},
    }],
  }
  const send: RouteTransportFetch = async (_url, init) => {
    if (init?.headers?.['Payment-Signature'] === undefined) {
      return response(402, '', { 'payment-required': Buffer.from(JSON.stringify(challenge)).toString('base64') })
    }
    effects.provider += 1
    return response(200, output, {
      'payment-response': encodePaymentResponseHeader({
        success: true,
        transaction: 'test:dynamic-published-operation',
        network: challenge.accepts[0]!.network,
        amount: challenge.accepts[0]!.amount,
        payer: 'test:dynamic-published-operation',
      }),
      'provider-receipt': 'mock:receipt',
    })
  }
  return {
    send,
    resolveCredential: (connectionRef) => connectionRef.length > 0 ? 'mock:credential' : undefined,
    readX402PaymentCredentialRef: () => 'env:AE_X402_PAYMENT_PRIVATE_KEY',
    readProviderConnectionCredentialRef: readDevelopmentProviderCredential,
    validateProviderConnectionAuthority: () => ({ kind: 'valid' as const }),
    x402PaymentSigningAvailable: () => true,
    verifyX402Settlement: async () => true,
    markX402PaymentPossiblySubmitted: () => undefined,
    prepareX402PaymentAuthorization: async (request) => {
      const identity = canonicalDigest({
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      })
      const existing = custody.get(identity)
      if (existing !== undefined) {
        return {
          custodyRef: existing.custodyRef,
          authorizationDigest: existing.authorizationDigest,
        }
      }
      effects.payment += 1
      const paymentSignature = 'mock:signature'
      const prepared = {
        custodyRef: canonicalDigest({ kind: 'development-x402-custody:v1', identity }),
        authorizationDigest: canonicalDigest(paymentSignature),
      }
      custody.set(identity, { ...prepared, paymentSignature })
      return prepared
    },
    readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) =>
      [...custody.values()].find((candidate) =>
        candidate.custodyRef === custodyRef
        && candidate.authorizationDigest === authorizationDigest)?.paymentSignature,
    readX402PaymentAuthorizationByDigest: async ({ authorizationDigest }) =>
      [...custody.values()].find((candidate) =>
        candidate.authorizationDigest === authorizationDigest)?.paymentSignature,
  }
}
function readDevelopmentProviderCredential(input: ProviderConnectionAuthorityLookup) {
  if (
    input.connectionRef !== 'connection:mock-provider'
    || input.providerRef !== 'provider:mock-provider'
    || input.adapterId !== 'x402-fetch:v2'
  ) {
    return { kind: 'unavailable' as const, reason: 'not_found' as const }
  }
  if (input.authorityGeneration !== 1) {
    return { kind: 'unavailable' as const, reason: 'stale_generation' as const }
  }
  if (input.authorityDigest !== developmentProviderConnectionAuthorityDigest({
    connectionRef: 'connection:mock-provider',
    businessId: 'mock:business:published-api',
    providerRef: 'provider:mock-provider',
    adapterId: 'x402-fetch:v2',
  })) {
    return { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
  }
  return { kind: 'resolved' as const, credentialRef: 'connection:mock-provider' }
}

export function preReleaseRuntime(
  endpoint: string,
  mode: 'credential_unavailable' | 'challenge_invalid' | 'challenge_mismatch'
    | 'payment_outside_authority' | 'signing_unavailable' | 'endpoint_refusal',
): RouteTransportRuntime {
  const challenge = {
    x402Version: 2,
    resource: { url: `${endpoint}?symbol=BTC&convert=USD` },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
      amount: '10000',
      asset: '0xmock-usdc',
      payTo: mode === 'challenge_mismatch' ? '0xother-recipient' : '0xmock-provider-recipient',
      maxTimeoutSeconds: mode === 'payment_outside_authority' ? 100_000 : 30,
      extra: {},
    }],
  }
  return {
    resolveCredential: (connectionRef) => connectionRef.length > 0 && mode !== 'credential_unavailable'
      ? 'mock:credential'
      : undefined,
    readProviderConnectionCredentialRef: (input) => mode === 'credential_unavailable'
      ? { kind: 'unavailable' as const, reason: 'credential_unavailable' as const }
      : readDevelopmentProviderCredential(input),
    validateProviderConnectionAuthority: () => ({ kind: 'valid' as const }),
    x402PaymentSigningAvailable: () => mode !== 'signing_unavailable',
    send: async () => mode === 'endpoint_refusal'
      ? response(503, JSON.stringify({ reason: 'unavailable' }), {})
      : response(402, '', {
          'payment-required': mode === 'challenge_invalid'
            ? 'not-base64-json'
            : Buffer.from(JSON.stringify(challenge)).toString('base64'),
        }),
  }
}

function response(status: number, body: string, headers: Record<string, string>): Response {
  return new Response(body, { status, headers })
}

export function rematerializeRevision(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
  revision: number,
) {
  const publicationDigest = canonicalDigest({ fixture: 'publication', revision })
  const publication = {
    ...fixture.sourceMaterial.publication,
    revision,
    sourceDigest: publicationDigest,
  }
  const qualification = {
    ...fixture.sourceMaterial.qualification,
    candidate: { ...fixture.sourceMaterial.qualification.candidate, revision },
    qualificationDigest: canonicalDigest({ fixture: 'qualification', revision }),
    sources: fixture.sourceMaterial.qualification.sources.map((source) =>
      source.kind === 'publication'
        ? { ...source, ref: `${publication.publicationRef}@${revision}`, digest: publicationDigest }
        : source),
  }
  const currentConnectionAuthority = fixture.sourceMaterial.connectionAuthority
  if (currentConnectionAuthority === undefined) {
    throw new Error('published_operation_connection_authority_missing')
  }
  const connectionAuthority = {
    ...currentConnectionAuthority,
    operationRef: createPublicOperationRef({
      operationId: capabilityOperationId(fixture.sourceMaterial.contract.ref.capabilityId),
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      contractRef: fixture.sourceMaterial.contract.ref,
    }),
  }
  return materializePublishedOperation({
    ...fixture.sourceMaterial,
    publication,
    qualification,
    connectionAuthority,
  })
}

export function rematerializeFixedPrice(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
  amount: ExactAmount,
) {
  const pricingConfig = {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount: amount,
  }
  const offering = {
    ...fixture.sourceMaterial.offering,
    presentation: {
      ...fixture.sourceMaterial.offering.presentation,
      price: { kind: 'fixed' as const, amount: pricingConfig.paidAmount },
    },
  }
  const originalConfig = fixture.sourceMaterial.binding.adapter.config
  if (!isRecord(originalConfig)) throw new Error('published_operation_config_invalid')
  const payment = fixture.operation.identity.payment
  if (payment.kind !== 'x402') throw new Error('published_operation_payment_invalid')
  const paymentAmount = rescaleExactAmount(amount, 6)
  if (paymentAmount === undefined) throw new Error('published_operation_payment_amount_invalid')
  const config = {
    ...originalConfig,
    currency: amount.currency,
    routeAmountExponent: amount.exponent,
    paymentRequiredJson: stableStringify(validatePaymentRequired({
      x402Version: 2,
      resource: { url: fixture.operation.binding.endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: payment.network,
        amount: paymentAmount.units,
        asset: payment.asset,
        payTo: payment.payTo,
        maxTimeoutSeconds: 60,
        extra: {},
      }],
    }) as StableHashValue),
  }
  const binding = defineCapabilityTransportBindingRegistration({
    ...fixture.sourceMaterial.binding,
    adapter: { ...fixture.sourceMaterial.binding.adapter, config },
  })
  const admitted = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
  })
  if (admitted.kind !== 'admitted') throw new Error(admitted.reason)
  const offeringDigest = capabilityOfferingRegistrationHash(offering)
  const bindingDigest = capabilityBindingRegistrationHash(binding, admitted.transport)
  const qualification = {
    ...fixture.sourceMaterial.qualification,
    sources: fixture.sourceMaterial.qualification.sources.map((source) =>
      source.kind === 'offering'
        ? { ...source, digest: offeringDigest }
        : source.kind === 'binding'
          ? { ...source, digest: bindingDigest }
          : source),
  }
  return materializePublishedOperation({
    ...fixture.sourceMaterial,
    publication: {
      ...fixture.sourceMaterial.publication,
      pricingConfig,
      priceDigest: pricingConfigDigest(pricingConfig),
    },
    offering,
    binding,
    admittedTransport: admitted.transport,
    qualification,
  })
}
