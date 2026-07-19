import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from './public'
import {
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
} from './published-operation'
import type { SuppliedCandidateQualification } from './server'

const observedAt = Date.parse('2026-07-19T08:00:00.000Z')
const validUntil = observedAt + 300_000
const endpointPath = '/x402/v3/cryptocurrency/quotes/latest'

export const developmentPublishedEndpointCards = [
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
        symbol: { type: 'string', minLength: 1 },
        convert: { type: 'string', minLength: 3, maxLength: 3 },
      },
      required: ['symbol', 'convert'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { data: { type: 'object', additionalProperties: true } },
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
      price: { kind: 'fixed', currency: 'USD', amountMinor: 1 },
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
    credentialRef: 'env:MOCK_PROVIDER_CREDENTIAL',
    continuation: { kind: 'single_response', evidenceRefs: ['mock:evidence:continuation'] },
    cancellation: { kind: 'unsupported', evidenceRefs: ['mock:evidence:cancellation'] },
    adapter: { adapterId: 'x402-fetch:v2', config },
    registrationEvidenceRefs: ['mock:evidence:binding'],
  })
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
        digest: canonicalDigest(offering as StableHashValue), evidenceRefs: ['mock:evidence:offering'],
      },
      {
        kind: 'binding', ref: `binding:${binding.bindingId}`,
        digest: canonicalDigest(binding as StableHashValue), evidenceRefs: ['mock:evidence:binding'],
      },
      {
        kind: 'readiness', ref: 'readiness:mock:publication:published-api@7',
        digest: canonicalDigest({ status: 402, observedAt }), evidenceRefs: ['mock:evidence:fresh-402'],
      },
    ],
  }
  const operation = materializePublishedOperation({
    publication: {
      publicationRef: qualification.candidate.publicationRef,
      revision: qualification.candidate.revision,
      businessId: qualification.candidate.businessId,
      sourceDigest: qualification.sources[0]!.digest,
      readinessObservedAt: observedAt,
      readinessValidUntil: validUntil,
      readinessEvidenceRefs: ['mock:evidence:fresh-402'],
    },
    contract,
    offering,
    offeringDigest: qualification.sources[2]!.digest,
    binding,
    bindingDigest: qualification.sources[3]!.digest,
    admittedConfig: config,
    qualification,
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
    readinessObservation: { status: 402, observedAt, validUntil, evidenceRef: 'mock:evidence:fresh-402' },
    usageLabel: '8 calls · 2 distinct payers · rolling 30 days',
    claimCeiling:
      'Fixture and labelled local development evidence only; no hosted route, independent provider, settlement, fulfilment, production safety, or customer value.',
  }
}

export function verifyDevelopmentPublishedOperationEvidence(
  packet: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
): void {
  if (packet.discovery.length !== 5
    || packet.operation.identity.endpoint.resource !== `GET ${endpointPath}`
    || packet.operation.identity.price.kind !== 'fixed'
    || packet.operation.identity.price.currency !== 'USD'
    || packet.operation.identity.price.amountMinor !== 1
    || packet.operation.usageObservation?.calls !== 8
    || packet.operation.usageObservation.distinctPayers !== 2
    || packet.descriptor.retryClass !== 'reconcile_before_retry'
    || packet.descriptor.authorityRequirement !== 'principal'
    || !packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD' })
    || packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD', method: 'POST' })) {
    throw new Error('development_published_operation_evidence_invalid')
  }
}
