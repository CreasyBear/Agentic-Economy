import type { InvocationActor, ReconciliationEvidence, ReconciliationEvidenceMaterial } from '@/modules/action-invocation'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { pricingConfigDigest } from '@/modules/money/public'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding'
import type { CapabilityGraphPorts, GraphCatalogAccessPath, GraphPublicationRow } from '@/modules/capability-supply/internal/graph'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOperationId,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  createPublicOperationRef,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import { qualifySuppliedCandidate, type SuppliedCandidateQuoteInput } from '@/modules/capability-supply/server'

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

const catalogOrigin = {
  kind: 'catalog_offering' as const,
  offeringRef: 'mock:catalog-offering:quote',
  offeringRevision: 1,
  offeringSourceHash: canonicalDigest({
    fixture: 'mock-catalog-offering',
    offeringRef: 'mock:catalog-offering:quote',
    revision: 1,
  }),
  declaredAccessPathRef: 'mock:catalog-access-path:quote',
  accessPathSourceHash: canonicalDigest({
    fixture: 'mock-catalog-access-path',
    accessPathRef: 'mock:catalog-access-path:quote',
  }),
}
const pricingConfig = {
  version: 'pricing:v2' as const,
  unit: 'call' as const,
  paidAmount: { currency: 'USD' as const, units: '1', exponent: 2 },
}
const priceDigest = pricingConfigDigest(pricingConfig)

export const developmentEvidenceCandidate = {
  publicationRef: 'mock:publication:quote',
  revision: 1,
  networkId: 'mock:network',
  businessId: 'mock:business:quote',
  offeringId: 'mock:offering:quote',
  bindingId: 'mock:binding:quote',
  contractRef: contract.ref,
}
const catalogAccessPath: GraphCatalogAccessPath = {
  accessPathRef: catalogOrigin.declaredAccessPathRef,
  businessId: developmentEvidenceCandidate.businessId,
  offeringRef: catalogOrigin.offeringRef,
  offeringRevision: catalogOrigin.offeringRevision,
  offeringSourceHash: catalogOrigin.offeringSourceHash,
  status: 'published',
  sourceHash: catalogOrigin.accessPathSourceHash,
  descriptor: {
    kind: 'external_operation',
    name: 'Development quote',
    summary: 'Fixture-only quote collection endpoint.',
    url: 'https://development.invalid/quote',
    method: 'POST',
    provenance: 'business_declared',
  },
}
const operationRef = createPublicOperationRef({
  operationId: capabilityOperationId(contract.capabilityId),
  publicationRef: developmentEvidenceCandidate.publicationRef,
  publicationRevision: developmentEvidenceCandidate.revision,
  contractRef: contract.ref,
})

const offeringRegistration = defineCapabilityOfferingRegistration({
  offeringId: developmentEvidenceCandidate.offeringId,
  businessId: developmentEvidenceCandidate.businessId,
  networkId: 'mock:network',
  contractRef: contract.ref,
  origin: catalogOrigin,
  presentation: {
    label: 'Mock development provider', summary: 'MOCK/DEVELOPMENT ONLY',
    price: { kind: 'fixed', amount: pricingConfig.paidAmount }, materialTerms: [],
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
  authority: { kind: 'public_upstream' },
  continuation: { kind: 'single_response', evidenceRefs: ['mock:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['mock:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['mock:binding-registration'],
})

export function createDevelopmentEvidenceSupplyPorts(): CapabilityGraphPorts {
  const transportConfig = { method: 'POST' as const, requestTimeoutMs: 5_000 }
  const transport = {
    configJson: JSON.stringify(transportConfig),
    configDigest: canonicalDigest(transportConfig),
  }
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
    endpointUrl: bindingRegistration.endpointUrl, authority: bindingRegistration.authority,
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
    id: 'mock:publication-row', ...developmentEvidenceCandidate, operationRef, ...contract.ref,
    sourceKind: 'openapi_http', sourceDigest: canonicalDigest({ fixture: true }),
    pricingConfig, priceDigest,
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
      publicStatus: 'published', suppressed: false, currentlyPublished: true,
    }),
    loadProviderConnection: async () => undefined,
    catalogOriginIsCurrent: async (origin, businessId) => (
      businessId === developmentEvidenceCandidate.businessId
      && origin.offeringRef === catalogOrigin.offeringRef
      && origin.offeringRevision === catalogOrigin.offeringRevision
      && origin.offeringSourceHash === catalogOrigin.offeringSourceHash
      && origin.declaredAccessPathRef === catalogOrigin.declaredAccessPathRef
      && origin.accessPathSourceHash === catalogOrigin.accessPathSourceHash
    ),
    loadCatalogAccessPath: async (accessPathRef) => (
      accessPathRef === catalogAccessPath.accessPathRef ? catalogAccessPath : null
    ),
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
      const exact: ReconciliationEvidenceMaterial = {
        kind: material.kind,
        version: material.version,
        evidenceRef: material.evidenceRef,
        source: material.source,
        invocationRef: material.invocationRef,
        attemptRef: material.attemptRef,
        effectGeneration: material.effectGeneration,
        resolution: material.resolution,
        observedAt: material.observedAt,
      }
      const evidence = { ...exact, digest: canonicalDigest(exact as never) }
      issued.add(canonicalDigest(evidence as never))
      return evidence
    },
    verify: (evidence: ReconciliationEvidence) => issued.has(canonicalDigest(evidence as never)),
  }
}
