import type { InvocationActor, ReconciliationEvidence, ReconciliationEvidenceMaterial } from '@/modules/action-invocation'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { CapabilityBindingRow } from './internal/binding'
import type { CapabilityGraphPorts, GraphPublicationRow } from './internal/graph'
import type { CapabilityOfferingRow } from './internal/offering'
import {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from './public'
import { qualifySuppliedCandidate, type SuppliedCandidateQuoteInput } from './server'

export const developmentEvidenceNowMs = Date.parse('2026-07-19T08:00:00.000Z')
export const developmentEvidenceNow = () => new Date(developmentEvidenceNowMs).toISOString()
export const developmentEvidenceActor: InvocationActor = {
  callerRef: 'mock:caller:developer',
  principalRef: 'mock:principal:developer',
}

const contract = defineCapabilityContract({
  contractFormat: 'ae.capability-contract:v2',
  capabilityId: 'sandbox.development.quote',
  version: 1,
  name: 'Development quote',
  description: 'Fixture-only quote collection contract.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object', properties: { request: { type: 'string', minLength: 1 } },
    required: ['request'], additionalProperties: false,
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object', properties: { result: { type: 'string' } },
    required: ['result'], additionalProperties: false,
  },
  customerAnnotations: [
    { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
  ],
  dataUse: [{
    effectId: 'request_release', inputPointer: '/request', classification: 'personal',
    phase: 'execution', recipient: { kind: 'selected_binding' },
    purposes: ['return_requested_result'],
  }],
  effects: [{
    effectId: 'request_release', class: 'data_release',
    authority: 'mandate_or_explicit', reversibility: 'irreversible',
  }],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
})

export const developmentEvidenceCandidate = {
  publicationRef: 'mock:publication:quote',
  revision: 1,
  businessId: 'mock:business:quote',
  offeringId: 'mock:offering:quote',
  bindingId: 'mock:binding:quote',
  contractRef: contract.ref,
}

const offeringRegistration = defineCapabilityOfferingRegistration({
  offeringId: developmentEvidenceCandidate.offeringId,
  businessId: developmentEvidenceCandidate.businessId,
  networkId: 'mock:network',
  contractRef: contract.ref,
  presentation: {
    label: 'Mock development provider', summary: 'MOCK/DEVELOPMENT ONLY',
    price: { kind: 'on_request' }, materialTerms: [],
    commercialRelationship: {
      kind: 'none', summary: 'Fixture only.', influencesEligibility: false,
      influencesInclusion: false, influencesOrder: false, evidenceRefs: ['mock:commercial'],
    },
  },
  searchTerms: ['mock quote'],
  registrationEvidenceRefs: ['mock:offering-registration'],
})
const bindingRegistration = defineCapabilityTransportBindingRegistration({
  bindingId: developmentEvidenceCandidate.bindingId,
  offeringId: developmentEvidenceCandidate.offeringId,
  networkId: 'mock:network',
  contractRef: contract.ref,
  endpointUrl: 'https://development.invalid/quote',
  credentialRef: 'mock:credential-reference',
  continuation: { kind: 'single_response', evidenceRefs: ['mock:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['mock:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['mock:binding-registration'],
})

export function createDevelopmentEvidenceSupplyPorts(): CapabilityGraphPorts {
  const transport = { configJson: 'null', configDigest: canonicalDigest(null) }
  const offeringHash = capabilityOfferingRegistrationHash(offeringRegistration)
  const bindingHash = capabilityBindingRegistrationHash(bindingRegistration, transport)
  const offering: CapabilityOfferingRow = {
    ...offeringRegistration, ...contract.ref, registrationHash: offeringHash,
    status: 'active', admissionEvidenceRefs: ['mock:offering-admission'],
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: developmentEvidenceCandidate.offeringId, registrationHash: offeringHash,
      status: 'active', admissionEvidenceRefs: ['mock:offering-admission'],
    }),
    registeredAt: developmentEvidenceNowMs - 10_000, updatedAt: developmentEvidenceNowMs - 10_000,
  }
  const binding: CapabilityBindingRow = {
    _id: 'mock:binding-row', _creationTime: developmentEvidenceNowMs - 10_000,
    bindingId: developmentEvidenceCandidate.bindingId,
    offeringId: developmentEvidenceCandidate.offeringId,
    networkId: 'mock:network', ...contract.ref,
    endpointUrl: bindingRegistration.endpointUrl, credentialRef: bindingRegistration.credentialRef,
    continuation: bindingRegistration.continuation, cancellation: bindingRegistration.cancellation,
    adapterId: bindingRegistration.adapter.adapterId, ...transport,
    registrationEvidenceRefs: bindingRegistration.registrationEvidenceRefs,
    registrationHash: bindingHash, admission: 'admitted', conformance: 'conformant',
    admissionEvidenceRefs: ['mock:binding-admission'],
    conformanceEvidenceRefs: ['mock:binding-conformance'],
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: developmentEvidenceCandidate.bindingId, registrationHash: bindingHash,
      admission: 'admitted', conformance: 'conformant',
      admissionEvidenceRefs: ['mock:binding-admission'],
      conformanceEvidenceRefs: ['mock:binding-conformance'],
    }),
    registeredAt: developmentEvidenceNowMs - 10_000, updatedAt: developmentEvidenceNowMs - 10_000,
  }
  const publication: GraphPublicationRow = {
    id: 'mock:publication-row', ...developmentEvidenceCandidate, ...contract.ref,
    sourceKind: 'openapi_http', sourceDigest: canonicalDigest({ fixture: true }),
    disposition: 'current', credentialState: 'ready', healthState: 'healthy',
    readinessObservedAt: developmentEvidenceNowMs - 1_000,
    readinessValidUntil: developmentEvidenceNowMs + 60_000,
    registrationEvidenceRefs: ['mock:publication-registration'],
    readinessEvidenceRefs: ['mock:readiness'],
  }
  return {
    loadPublicationAtRevision: async () => publication,
    listCurrentPublicationsByNetwork: async () => [],
    loadOfferingByOfferingId: async () => offering,
    loadBindingByBindingId: async () => binding,
    loadPublishedBusiness: async () => ({
      businessId: developmentEvidenceCandidate.businessId, trustTier: 'fixture_only',
      publicStatus: 'published', claimStatus: 'published',
      suppressed: false, currentlyPublished: true,
    }),
    getActiveExactCapabilityContract: async () => ({
      kind: 'found', ref: contract.ref, documentJson: JSON.stringify(contract),
      registeredAt: developmentEvidenceNowMs - 10_000,
    }),
    getExactRegisteredCapabilityContract: async () => ({
      kind: 'found', contract, registeredAt: developmentEvidenceNowMs - 10_000,
    }),
    patchProbeReadiness: async () => undefined,
  }
}

export async function createDevelopmentEvidenceQuoteInput(
  graph: CapabilityGraphPorts,
): Promise<SuppliedCandidateQuoteInput> {
  const qualified = await qualifySuppliedCandidate(graph, {
    candidate: developmentEvidenceCandidate,
    now: developmentEvidenceNowMs,
  })
  if (qualified.status !== 'eligible' || qualified.validUntil === undefined) {
    throw new Error(`mock_qualification_failed:${qualified.reasons.join(',')}`)
  }
  return {
    target: developmentEvidenceCandidate,
    qualificationDigest: qualified.qualificationDigest,
    qualificationValidUntil: qualified.validUntil,
    quoteRequest: {
      serviceReference: 'mock:service:strata-repair-assessment',
      requestedFields: ['price', 'validUntil', 'terms'],
      constraints: { siteType: 'strata_common_property', timing: 'weekday_business_hours' },
    },
    disclosure: {
      fields: [
        'quoteRequest.serviceReference',
        'quoteRequest.constraints.siteType',
        'quoteRequest.constraints.timing',
      ],
      limits: {
        'quoteRequest.serviceReference': 500,
        'quoteRequest.constraints.siteType': 120,
        'quoteRequest.constraints.timing': 120,
      },
      purpose: 'request_development_quote',
    },
    operationKey: 'mock:operation:quote:1',
  }
}

export function createDevelopmentEvidenceVerifier() {
  const issued = new Set<string>()
  return {
    issue(material: ReconciliationEvidenceMaterial): ReconciliationEvidence {
      const evidence = { ...material, digest: canonicalDigest(material as never) }
      issued.add(canonicalDigest(evidence as never))
      return evidence
    },
    verify: (evidence: ReconciliationEvidence) => issued.has(canonicalDigest(evidence as never)),
  }
}
