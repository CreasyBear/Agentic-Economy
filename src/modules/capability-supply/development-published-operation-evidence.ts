import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  createPublicOperationRef,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from './public'
import {
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from './published-operation'
import type { SuppliedCandidateQualification } from './server'

const observedAt = Date.parse('2026-07-19T08:00:00.000Z')
const validUntil = observedAt + 300_000
const endpointPath = '/x402/v3/cryptocurrency/quotes/latest'
const expectedPayment = {
  network: 'eip155:8453',
  asset: '0xmock-usdc',
  payTo: '0xmock-provider-recipient',
  currency: 'USD',
} as const
const claimCeiling =
  'Fixture and labelled local development evidence only; no execution or host parity, no hosted route, independent provider, settlement, fulfilment, production safety, or customer value.'

function requirePublishedFixture<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined) throw new Error(errorCode)
  return value
}

const developmentPublishedEndpointCards = [
  { method: 'GET', path: endpointPath, summary: 'Latest cryptocurrency quotes' },
  { method: 'GET', path: '/x402/v3/cryptocurrency/map', summary: 'Cryptocurrency identifiers' },
  { method: 'GET', path: '/x402/v3/fiat/map', summary: 'Fiat currency identifiers' },
  { method: 'GET', path: '/x402/v3/tools/price-conversion', summary: 'Price conversion' },
  { method: 'POST', path: '/x402/v3/key/info', summary: 'API key information' },
] as const

export function buildDevelopmentPublishedOperationEvidence() {
  const contract = defineCapabilityContract({
    contractFormat: 'ae.capability-contract:v2',
    capabilityId: 'cryptocurrency.quotes.latest',
    version: 1,
    name: 'Latest cryptocurrency quotes',
    description: 'Returns the latest quote for declared symbols and conversion currency.',
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
        data: {
          type: 'object',
          properties: {
            BTC: {
              type: 'object',
              properties: {
                symbol: { type: 'string', enum: ['BTC'] },
                quote: {
                  type: 'object',
                  properties: {
                    USD: {
                      type: 'object',
                      properties: {
                        price: { type: 'number', exclusiveMinimum: 0 },
                        last_updated: { type: 'string', format: 'date-time' },
                      },
                      required: ['price', 'last_updated'],
                      additionalProperties: false,
                    },
                  },
                  required: ['USD'],
                  additionalProperties: false,
                },
              },
              required: ['symbol', 'quote'],
              additionalProperties: false,
            },
          },
          required: ['BTC'],
          additionalProperties: false,
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'symbol', document: 'input', pointer: '/symbol', label: 'Symbol', role: 'request' },
      { annotationId: 'convert', document: 'input', pointer: '/convert', label: 'Currency', role: 'constraint' },
      { annotationId: 'data', document: 'output', pointer: '/data', label: 'Quote data', role: 'completion_evidence' },
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
    evidence: [{ evidenceId: 'data', outputPointer: '/data', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  })
  const offering = defineCapabilityOfferingRegistration({
    offeringId: 'mock:offering:crypto-quotes',
    businessId: 'mock:business:published-api',
    networkId: 'mock:network:development',
    contractRef: contract.ref,
    presentation: {
      label: 'Latest cryptocurrency quotes',
      summary: 'MOCK/DEVELOPMENT ONLY published endpoint.',
      price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
      materialTerms: [{ termId: 'mock:term:fixture', label: 'Environment', value: 'MOCK/DEVELOPMENT ONLY' }],
      commercialRelationship: {
        kind: 'none', summary: 'Fixture only.', influencesEligibility: false,
        influencesInclusion: false, influencesOrder: false,
        evidenceRefs: ['mock:evidence:commercial'],
      },
    },
    searchTerms: ['cryptocurrency', 'quotes'],
    registrationEvidenceRefs: ['mock:evidence:offering'],
  })
  const config = {
    method: 'GET',
    query: [
      { inputPointer: '/symbol', parameter: 'symbol' },
      { inputPointer: '/convert', parameter: 'convert' },
    ],
    requestTimeoutMs: 5_000,
    scheme: 'exact',
    network: 'eip155:8453',
    currency: 'USD',
    routeAmountExponent: 2,
    assetAmountExponent: 6,
    asset: '0xmock-usdc',
    payTo: '0xmock-provider-recipient',
  } as const
  const binding = defineCapabilityTransportBindingRegistration({
    bindingId: 'mock:binding:crypto-quotes',
    offeringId: offering.offeringId,
    networkId: offering.networkId,
    contractRef: contract.ref,
    endpointUrl: `https://provider.example${endpointPath}`,
    authority: {
      kind: 'provider_connection',
      connectionRef: 'connection:mock-provider',
      providerRef: 'provider:mock-provider',
    },
    continuation: { kind: 'single_response', evidenceRefs: ['mock:evidence:continuation'] },
    cancellation: { kind: 'unsupported', evidenceRefs: ['mock:evidence:cancellation'] },
    adapter: { adapterId: 'x402-fetch:v2', config },
    registrationEvidenceRefs: ['mock:evidence:binding'],
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
  const qualification: SuppliedCandidateQualification = {
    kind: 'supplied_candidate_qualification',
    environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
    candidate: {
      publicationRef: 'mock:publication:published-api',
      revision: 7,
      businessId: offering.businessId,
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: contract.ref,
    },
    status: 'eligible',
    reasons: [],
    observedAt,
    validUntil,
    qualificationDigest: canonicalDigest({ fixture: 'qualification' }),
    sources: [
      {
        kind: 'publication', ref: 'mock:publication:published-api@7',
        digest: canonicalDigest({ fixture: 'publication' }), evidenceRefs: ['mock:evidence:publication'],
      },
      {
        kind: 'contract', ref: 'contract:cryptocurrency.quotes.latest@1',
        digest: contract.ref.contractDigest, evidenceRefs: ['mock:evidence:contract'],
      },
      {
        kind: 'offering', ref: `offering:${offering.offeringId}`,
        digest: offeringDigest, evidenceRefs: ['mock:evidence:offering'],
      },
      {
        kind: 'binding', ref: `binding:${binding.bindingId}`,
        digest: bindingDigest, evidenceRefs: ['mock:evidence:binding'],
      },
      {
        kind: 'readiness', ref: 'readiness:mock:publication:published-api@7',
        digest: canonicalDigest({ status: 402, observedAt }), evidenceRefs: ['mock:evidence:fresh-402'],
      },
    ],
  }
  const publicationSource = requirePublishedFixture(
    qualification.sources[0],
    'published_operation_source_missing',
  )
  const connectionAuthority = binding.authority.kind === 'provider_connection'
    ? {
        connectionRef: binding.authority.connectionRef,
        providerRef: binding.authority.providerRef,
        adapterId: binding.adapter.adapterId,
        authorityGeneration: 1,
        authorityDigest: canonicalDigest({
          connectionRef: binding.authority.connectionRef,
          providerRef: binding.authority.providerRef,
          authorityGeneration: 1,
        }),
        operationRef: createPublicOperationRef({
          operationId: capabilityOperationId(contract.ref.capabilityId),
          publicationRef: qualification.candidate.publicationRef,
          publicationRevision: qualification.candidate.revision,
          contractRef: contract.ref,
        }),
        grantedScopes: [],
        grantedResources: [],
      }
    : undefined
  const operation = materializePublishedOperation({
    publication: {
      publicationRef: qualification.candidate.publicationRef,
      revision: qualification.candidate.revision,
      businessId: qualification.candidate.businessId,
      sourceDigest: publicationSource.digest,
      readinessObservedAt: observedAt,
      readinessValidUntil: validUntil,
      readinessEvidenceRefs: ['mock:evidence:fresh-402'],
    },
    contract,
    offering,
    binding,
    admittedTransport: admission.transport,
    qualification,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
    usageObservation: {
      window: { kind: 'rolling', days: 30 },
      calls: 8,
      distinctPayers: 2,
      observedAt,
      source: 'mock:provider-attributed-usage-export',
      evidenceRefs: ['mock:evidence:usage-export'],
    },
  })
  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    discovery: developmentPublishedEndpointCards,
    operation,
    descriptor: materializeRuntimePublishedOperation(operation),
    sourceMaterial: {
      publication: {
        publicationRef: qualification.candidate.publicationRef,
        revision: qualification.candidate.revision,
        businessId: qualification.candidate.businessId,
        sourceDigest: publicationSource.digest,
        readinessObservedAt: observedAt,
        readinessValidUntil: validUntil,
        readinessEvidenceRefs: ['mock:evidence:fresh-402'],
      },
      contract,
      offering,
      binding,
      admittedTransport: admission.transport,
      ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
      qualification,
      ...(operation.usageObservation === undefined
        ? {}
        : { usageObservation: operation.usageObservation }),
    },
    readinessObservation: { status: 402, observedAt, validUntil, evidenceRef: 'mock:evidence:fresh-402' },
    usageLabel: '8 calls · 2 distinct payers · rolling 30 days',
    claimCeiling,
  }
}
export function projectDevelopmentPublishedOperationEvidence<
  T extends { readonly descriptor: RuntimePublishedOperationDescriptor },
>(fixture: T) {
  const { descriptor, ...material } = fixture
  const {
    validateInput: _validateInput,
    validateOutput: _validateOutput,
    ...serializableDescriptor
  } = descriptor
  return { ...material, descriptor: serializableDescriptor }
}


export function verifyDevelopmentPublishedOperationEvidence(
  packet: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
): void {
  let rebuilt
  try {
    rebuilt = materializePublishedOperation(packet.sourceMaterial)
  } catch {
    throw new Error('development_published_operation_evidence_invalid')
  }
  const descriptor = materializeRuntimePublishedOperation(rebuilt)
  const expectedDiscoveryDigest = canonicalDigest(developmentPublishedEndpointCards)
  const actualDiscoveryDigest = canonicalDigest(packet.discovery)
  const operationDigest = canonicalDigest(packet.operation)
  const rebuiltDigest = canonicalDigest(rebuilt)
  const descriptorDigest = runtimeDescriptorDigest(packet.descriptor)
  const rebuiltDescriptorDigest = runtimeDescriptorDigest(descriptor)
  if (packet.discovery.length !== 5
    || actualDiscoveryDigest !== expectedDiscoveryDigest
    || operationDigest !== rebuiltDigest
    || packet.operation.materialDigest !== rebuilt.materialDigest
    || descriptorDigest !== rebuiltDescriptorDigest
    || packet.operation.identity.endpoint.resource !== `GET ${endpointPath}`
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
    || packet.operation.usageObservation?.calls !== 8
    || packet.operation.usageObservation.distinctPayers !== 2
    || packet.operation.usageObservation.window.days !== 30
    || packet.operation.usageObservation.observedAt !== observedAt
    || packet.usageLabel !== '8 calls · 2 distinct payers · rolling 30 days'
    || packet.claimCeiling !== claimCeiling
    || packet.descriptor.retryClass !== 'reconcile_before_retry'
    || packet.descriptor.authorityRequirement !== 'principal'
    || !packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD' })
    || packet.descriptor.validateInput({ symbol: 'ETH', convert: 'USD' })
    || packet.descriptor.validateInput({ symbol: 'BTC', convert: 'EUR' })
    || packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD', method: 'POST' })) {
    throw new Error('development_published_operation_evidence_invalid')
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
