import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createDevelopmentProviderConnectionAuthority,
} from './development-published-operation-evidence'
import { pricingConfigDigest } from '@/modules/money/public'

import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  createPublicOperationRef,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import {
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
} from '@/modules/capability-supply/published-operation'
import type { SuppliedCandidateQualification } from '@/modules/capability-supply/server'

const observedAt = Date.parse('2026-07-20T08:00:00.000Z')
const validUntil = observedAt + 300_000
const endpointUrl = 'https://alternate-provider.example/v1/spot'
const expectedPayment = {
  network: 'eip155:8453',
  asset: '0xmock-usdc',
  payTo: '0xmock-alternate-recipient',
  currency: 'USD',
} as const
const pricingConfig = {
  version: 'pricing:v2' as const,
  unit: 'call' as const,
  paidAmount: { currency: 'USD', units: '1', exponent: 2 },
}
const priceDigest = pricingConfigDigest(pricingConfig)
const claimCeiling =
  'Labelled local alternate-provider fixture only; no hosted route, real payment, independent provider, settlement, fulfilment, production safety, or customer value.'

function requireAlternateFixture<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined) throw new Error(errorCode)
  return value
}

export function buildDevelopmentAlternatePublishedOperationEvidence() {
  const contract = defineCapabilityContract({
    contractFormat: 'ae.capability-contract:v2',
    capabilityId: 'btc-usd.spot',
    version: 1,
    name: 'BTC/USD spot quote',
    description: 'Returns the current BTC/USD spot quote.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        symbol: { type: 'string', enum: ['BTC'] },
        convert: { type: 'string', enum: ['USD'] },
      },
      required: ['symbol', 'convert'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        spot: {
          type: 'object',
          properties: {
            base: { type: 'string', enum: ['BTC'] },
            quote: { type: 'string', enum: ['USD'] },
            amount: { type: 'string', pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$' },
            observed_at: { type: 'string', format: 'date-time' },
          },
          required: ['base', 'quote', 'amount', 'observed_at'],
          additionalProperties: false,
        },
      },
      required: ['spot'],
      additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'symbol', document: 'input', pointer: '/symbol', label: 'Symbol', role: 'request' },
      { annotationId: 'convert', document: 'input', pointer: '/convert', label: 'Currency', role: 'constraint' },
      { annotationId: 'spot', document: 'output', pointer: '/spot', label: 'Spot quote', role: 'completion_evidence' },
    ],
    dataUse: [
      {
        effectId: 'query_release', inputPointer: '/symbol', classification: 'public',
        phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_quote'],
      },
      {
        effectId: 'query_release', inputPointer: '/convert', classification: 'public',
        phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_quote'],
      },
    ],
    effects: [
      {
        effectId: 'query_release', class: 'data_release',
        authority: 'mandate_or_explicit', reversibility: 'irreversible',
      },
      {
        effectId: 'payment_release', class: 'financial_exposure',
        authority: 'mandate_or_explicit', reversibility: 'irreversible',
      },
    ],
    evidence: [{ evidenceId: 'spot', outputPointer: '/spot', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  })
  const offering = defineCapabilityOfferingRegistration({
    offeringId: 'mock:offering:alternate-btc-usd-spot',
    businessId: 'mock:business:alternate-quote-api',
    networkId: 'mock:network:development',
    contractRef: contract.ref,
    presentation: {
      label: 'BTC/USD spot quote',
      summary: 'MOCK/DEVELOPMENT ONLY alternate published endpoint.',
      price: { kind: 'fixed', amount: pricingConfig.paidAmount },
      materialTerms: [
        { termId: 'mock:term:alternate-fixture', label: 'Environment', value: 'MOCK/DEVELOPMENT ONLY' },
      ],
      commercialRelationship: {
        kind: 'none',
        summary: 'Fixture only.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['mock:evidence:alternate-commercial'],
      },
    },
    searchTerms: ['btc', 'usd', 'spot quote'],
    registrationEvidenceRefs: ['mock:evidence:alternate-offering'],
  })
  const config = {
    method: 'GET',
    query: [
      { inputPointer: '/symbol', parameter: 'base' },
      { inputPointer: '/convert', parameter: 'quote' },
    ],
    requestTimeoutMs: 5_000,
    scheme: 'exact',
    network: expectedPayment.network,
    currency: expectedPayment.currency,
    routeAmountExponent: 2,
    assetAmountExponent: 6,
    asset: expectedPayment.asset,
    payTo: expectedPayment.payTo,
  } as const
  const binding = defineCapabilityTransportBindingRegistration({
    bindingId: 'mock:binding:alternate-btc-usd-spot',
    offeringId: offering.offeringId,
    networkId: offering.networkId,
    contractRef: contract.ref,
    endpointUrl,
    authority: {
      kind: 'provider_connection',
      connectionRef: 'connection:mock-alternate-provider',
      providerRef: 'provider:mock-alternate-provider',
    },
    continuation: {
      kind: 'single_response',
      evidenceRefs: ['mock:evidence:alternate-continuation'],
    },
    cancellation: {
      kind: 'unsupported',
      evidenceRefs: ['mock:evidence:alternate-cancellation'],
    },
    adapter: { adapterId: 'x402-fetch:v2', config },
    registrationEvidenceRefs: ['mock:evidence:alternate-binding'],
  })
  const admission = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
  })
  if (admission.kind !== 'admitted') throw new Error(admission.reason)

  const offeringDigest = capabilityOfferingRegistrationHash(offering)
  const bindingDigest = capabilityBindingRegistrationHash(binding, admission.transport)
  const publicationDigest = canonicalDigest({ fixture: 'alternate-publication' })
  const qualification: SuppliedCandidateQualification = {
    kind: 'supplied_candidate_qualification',
    environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
    candidate: {
      publicationRef: 'mock:publication:alternate-quote-api',
      revision: 3,
      networkId: offering.networkId,
      businessId: offering.businessId,
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: contract.ref,
    },
    status: 'eligible',
    reasons: [],
    observedAt,
    validUntil,
    qualificationDigest: canonicalDigest({ fixture: 'alternate-qualification' }),
    sources: [
      {
        kind: 'publication',
        ref: 'mock:publication:alternate-quote-api@3',
        digest: publicationDigest,
        evidenceRefs: ['mock:evidence:alternate-publication'],
      },
      {
        kind: 'contract',
        ref: 'contract:btc-usd.spot@1',
        digest: contract.ref.contractDigest,
        evidenceRefs: ['mock:evidence:alternate-contract'],
      },
      {
        kind: 'offering',
        ref: `offering:${offering.offeringId}`,
        digest: offeringDigest,
        evidenceRefs: ['mock:evidence:alternate-offering'],
      },
      {
        kind: 'binding',
        ref: `binding:${binding.bindingId}`,
        digest: bindingDigest,
        evidenceRefs: ['mock:evidence:alternate-binding'],
      },
      {
        kind: 'readiness',
        ref: 'readiness:mock:publication:alternate-quote-api@3',
        digest: canonicalDigest({ status: 402, observedAt }),
        evidenceRefs: ['mock:evidence:alternate-fresh-402'],
      },
    ],
  }
  const publicationSource = requireAlternateFixture(
    qualification.sources[0],
    'alternate_published_source_missing',
  )
  const publication = {
    publicationRef: qualification.candidate.publicationRef,
    revision: qualification.candidate.revision,
    businessId: qualification.candidate.businessId,
    runtimeEnvironment: 'sandbox' as const,
    sourceDigest: publicationSource.digest,
    pricingConfig,
    priceDigest,
    readinessObservedAt: observedAt,
    readinessValidUntil: validUntil,
    readinessEvidenceRefs: ['mock:evidence:alternate-fresh-402'],
  }
  const operationRef = createPublicOperationRef({
    operationId: capabilityOperationId(contract.ref.capabilityId),
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef: contract.ref,
  })
  const connectionAuthority = binding.authority.kind === 'provider_connection'
    ? createDevelopmentProviderConnectionAuthority({
        connectionRef: binding.authority.connectionRef,
        businessId: offering.businessId,
        providerRef: binding.authority.providerRef,
        adapterId: binding.adapter.adapterId,
        operationRef,
        grantedScopes: [],
        grantedResources: [],
        observedAt,
      })
    : undefined
  const sourceMaterial = {
    publication,
    contract,
    offering,
    binding,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
    admittedTransport: admission.transport,
    qualification,
  }
  const operation = materializePublishedOperation(sourceMaterial)

  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    operation,
    descriptor: materializeRuntimePublishedOperation(operation),
    sourceMaterial,
    readinessObservation: {
      status: 402,
      observedAt,
      validUntil,
      evidenceRef: 'mock:evidence:alternate-fresh-402',
    },
    claimCeiling,
  }
}

export function verifyDevelopmentAlternatePublishedOperationEvidence(
  packet: ReturnType<typeof buildDevelopmentAlternatePublishedOperationEvidence>,
): void {
  let rebuilt
  try {
    rebuilt = materializePublishedOperation(packet.sourceMaterial)
  } catch {
    throw new Error('development_alternate_published_operation_evidence_invalid')
  }
  const descriptor = materializeRuntimePublishedOperation(rebuilt)
  const operationDigest = canonicalDigest(packet.operation)
  const rebuiltDigest = canonicalDigest(rebuilt)
  if (
    operationDigest !== rebuiltDigest
    || packet.operation.materialDigest !== rebuilt.materialDigest
    || runtimeDescriptorDigest(packet.descriptor) !== runtimeDescriptorDigest(descriptor)
    || packet.operation.identity.businessId !== 'mock:business:alternate-quote-api'
    || packet.operation.identity.contractId !== 'btc-usd.spot'
    || packet.operation.identity.publicationRevision !== 3
    || packet.operation.identity.endpoint.url !== endpointUrl
    || packet.operation.identity.endpoint.resource !== 'GET /v1/spot'
    || packet.operation.identity.price.kind !== 'fixed'
    || packet.operation.identity.price.amount.currency !== 'USD'
    || packet.operation.identity.price.amount.units !== '1'
    || packet.operation.identity.price.amount.exponent !== 2
    || packet.operation.identity.payment.kind !== 'x402'
    || packet.operation.identity.payment.network !== expectedPayment.network
    || packet.operation.identity.payment.asset !== expectedPayment.asset
    || packet.operation.identity.payment.payTo !== expectedPayment.payTo
    || packet.operation.identity.payment.currency !== expectedPayment.currency
    || packet.operation.transport.configDigest
      !== canonicalDigest(JSON.parse(packet.operation.transport.configJson))
    || packet.readinessObservation.status !== 402
    || packet.readinessObservation.observedAt !== observedAt
    || packet.readinessObservation.validUntil !== validUntil
    || packet.operation.readiness.observedAt !== packet.readinessObservation.observedAt
    || packet.operation.readiness.validUntil !== packet.readinessObservation.validUntil
    || packet.claimCeiling !== claimCeiling
    || packet.descriptor.retryClass !== 'reconcile_before_retry'
    || packet.descriptor.authorityRequirement !== 'principal'
    || !packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD' })
    || packet.descriptor.validateInput({ symbol: 'ETH', convert: 'USD' })
    || packet.descriptor.validateInput({ symbol: 'BTC', convert: 'EUR' })
    || packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD', extra: true })
  ) {
    throw new Error('development_alternate_published_operation_evidence_invalid')
  }
}

function runtimeDescriptorDigest(
  descriptor: ReturnType<typeof materializeRuntimePublishedOperation>,
): string {
  return canonicalDigest({
    id: descriptor.id,
    version: descriptor.version,
    name: descriptor.name,
    summary: descriptor.summary,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    consequenceClass: descriptor.consequenceClass,
    authorityRequirement: descriptor.authorityRequirement,
    retryClass: descriptor.retryClass,
    materialInputPointers: descriptor.materialInputPointers,
    dataUse: descriptor.dataUse,
    effects: descriptor.effects,
    evidence: descriptor.evidence,
    safeContinuations: descriptor.safeContinuations,
    price: descriptor.price,
    target: descriptor.target,
  })
}
