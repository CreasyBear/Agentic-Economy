import { vi } from 'vitest'

import { defineCapabilityContract } from '@/modules/capability-contract/public'
import {
  connectionAuthoritySnapshotFromProviderConnection,
  type CapabilityBindingRow,
} from '@/modules/capability-supply/internal/binding'
import type {
  CapabilityGraphPorts,
  GraphCatalogAccessPath,
  GraphPublicationRow,
} from '@/modules/capability-supply/internal/graph'
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
import {
  createProviderConnection,
  type CreateProviderConnectionCommand,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import {
  collectSuppliedCandidateQuoteAction,
  qualifySuppliedCandidate,
  type SuppliedCandidateQuoteInput,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { pricingConfigDigest } from '@/modules/money/public'
import {
  type ActionInvocationOrigin,
  type InvocationActor,
  createDevelopmentReleaseSignal,
  createInMemoryActionInvocationTracer,
} from '@/modules/action-invocation'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

export const nowMs = Date.parse('2026-07-19T08:00:00.000Z')
export const nowIso = () => new Date(nowMs).toISOString()
export const actor: InvocationActor = { callerRef: 'dev:caller', principalRef: 'dev:principal' }

export const contract = defineCapabilityContract(capabilityContractV2({
  capabilityId: 'sandbox.route.service.quote',
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}))
export const candidate = {
  publicationRef: 'dev:publication',
  revision: 3,
  networkId: 'ae:public',
  businessId: 'dev:business',
  offeringId: 'dev:offering',
  bindingId: 'dev:binding',
  contractRef: contract.ref,
}
export const operationRef = createPublicOperationRef({
  operationId: capabilityOperationId(contract.capabilityId),
  publicationRef: candidate.publicationRef,
  publicationRevision: candidate.revision,
  contractRef: contract.ref,
})
export const catalogOrigin = {
  kind: 'catalog_offering' as const,
  offeringRef: 'catalog-offering:development-quote',
  offeringRevision: 2,
  offeringSourceHash: canonicalDigest({
    fixture: 'catalog-offering-development-quote',
    revision: 2,
  }),
  declaredAccessPathRef: 'catalog-access-path:development-quote',
  accessPathSourceHash: canonicalDigest({
    fixture: 'catalog-access-path-development-quote',
  }),
}
export const catalogAccessPath: GraphCatalogAccessPath = {
  accessPathRef: catalogOrigin.declaredAccessPathRef,
  businessId: candidate.businessId,
  offeringRef: catalogOrigin.offeringRef,
  offeringRevision: catalogOrigin.offeringRevision,
  offeringSourceHash: catalogOrigin.offeringSourceHash,
  status: 'published',
  sourceHash: catalogOrigin.accessPathSourceHash,
  descriptor: {
    kind: 'external_operation',
    name: 'Development quote',
    summary: 'Fixture-only quote endpoint.',
    url: 'https://development.invalid/quote',
    method: 'POST',
    provenance: 'business_declared',
  },
}
export const pricingConfig = {
  version: 'pricing:v2' as const,
  unit: 'call' as const,
  paidAmount: { currency: 'USD' as const, units: '1', exponent: 2 },
}
export const priceDigest = pricingConfigDigest(pricingConfig)
export const providerConnectionCommand: CreateProviderConnectionCommand = {
  commandId: 'command:create:development-quote',
  connectionRef: 'connection:development',
  businessId: candidate.businessId,
  providerRef: 'provider:development',
  providerAccountRef: 'account:development',
  adapterId: 'http-json:v1',
  credentialRef: 'env:DEVELOPMENT_QUOTE_SECRET',
  requestedScopes: ['quote:read'],
  grantedScopes: ['quote:read'],
  requestedResources: ['account:development'],
  grantedResources: ['account:development'],
  evidenceRefs: ['dev:connection'],
}
export function developmentProviderConnection(): ProviderConnection {
  const result = createProviderConnection(providerConnectionCommand, nowMs)
  if (result.kind !== 'applied') throw new Error(`provider connection fixture failed: ${result.kind}`)
  return result.connection
}
export const connectionAuthority = connectionAuthoritySnapshotFromProviderConnection(
  developmentProviderConnection(),
  operationRef,
)
export const offeringRegistration = defineCapabilityOfferingRegistration({
  offeringId: candidate.offeringId,
  businessId: candidate.businessId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  origin: catalogOrigin,
  presentation: {
    label: 'Development quote provider',
    summary: 'Labelled fixture supply for quote collection evaluation.',
    price: { kind: 'fixed', amount: pricingConfig.paidAmount },
    materialTerms: [],
    commercialRelationship: {
      kind: 'none',
      summary: 'No commercial influence in this development fixture.',
      influencesEligibility: false,
      influencesInclusion: false,
      influencesOrder: false,
      evidenceRefs: ['dev:commercial'],
    },
  },
  searchTerms: ['development quote'],
  registrationEvidenceRefs: ['dev:offering-registration'],
})
export const bindingRegistration = defineCapabilityTransportBindingRegistration({
  bindingId: candidate.bindingId,
  offeringId: candidate.offeringId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  endpointUrl: 'https://development.invalid/quote',
  authority: { kind: 'provider_connection', connectionRef: 'connection:development', providerRef: 'provider:development' },
  continuation: { kind: 'single_response', evidenceRefs: ['dev:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['dev:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['dev:binding-registration'],
})
export const admittedTransportConfig = { method: 'POST' as const, requestTimeoutMs: 5_000 }
export const admittedTransport = {
  configJson: JSON.stringify(admittedTransportConfig),
  configDigest: canonicalDigest(admittedTransportConfig),
}
export const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'dev:request', revision: 4 },
  { kind: 'standalone', ...actor },
]

export function offering(overrides: Partial<CapabilityOfferingRow> = {}): CapabilityOfferingRow {
  const registrationHash = capabilityOfferingRegistrationHash(offeringRegistration)
  const status = overrides.status ?? 'active'
  const admissionEvidenceRefs = ['dev:offering-admission']
  return {
    ...offeringRegistration,
    ...contract.ref,
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: candidate.offeringId,
      registrationHash,
      status,
      admissionEvidenceRefs,
    }),
    registeredAt: nowMs - 10_000,
    updatedAt: nowMs - 10_000,
    ...overrides,
  }
}

export function binding(overrides: Partial<CapabilityBindingRow> = {}): CapabilityBindingRow {
  const registrationHash = capabilityBindingRegistrationHash(bindingRegistration, admittedTransport)
  const admission = overrides.admission ?? 'admitted'
  const conformance = overrides.conformance ?? 'conformant'
  const admissionEvidenceRefs = ['dev:binding-admission']
  const conformanceEvidenceRefs = ['dev:binding-conformance']
  return {
    _id: 'dev:binding-row',
    _creationTime: nowMs - 10_000,
    bindingId: candidate.bindingId,
    offeringId: candidate.offeringId,
    networkId: 'ae:public',
    ...contract.ref,
    endpointUrl: bindingRegistration.endpointUrl,
    authority: bindingRegistration.authority,
    connectionAuthority,
    continuation: bindingRegistration.continuation,
    cancellation: bindingRegistration.cancellation,
    adapterId: bindingRegistration.adapter.adapterId,
    ...admittedTransport,
    registrationEvidenceRefs: bindingRegistration.registrationEvidenceRefs,
    registrationHash,
    admission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: candidate.bindingId,
      registrationHash,
      admission,
      conformance,
      admissionEvidenceRefs,
      conformanceEvidenceRefs,
    }),
    registeredAt: nowMs - 10_000,
    updatedAt: nowMs - 10_000,
    ...overrides,
  }
}

export function publication(overrides: Partial<GraphPublicationRow> = {}): GraphPublicationRow {
  return {
    id: 'dev:publication-row',
    ...candidate,
    operationRef,
    ...contract.ref,
    connectionAuthority,
    sourceKind: 'openapi_http',
    sourceDigest: canonicalDigest({ fixture: 'published quote capability' }),
    pricingConfig,
    priceDigest,
    disposition: 'current',
    credentialState: 'ready',
    healthState: 'healthy',
    readinessObservedAt: nowMs - 1_000,
    readinessValidUntil: nowMs + 60_000,
    registrationEvidenceRefs: ['dev:publication-registration'],
    readinessEvidenceRefs: ['dev:readiness'],
    ...overrides,
  }
}

export function qualificationPorts(overrides: Partial<CapabilityGraphPorts> = {}): CapabilityGraphPorts {
  return {
    loadPublicationAtRevision: async () => publication(),
    listCurrentPublicationsByNetwork: async () => [],
    loadOfferingByOfferingId: async () => offering(),
    loadBindingByBindingId: async () => binding(),
    loadPublishedBusiness: async () => ({
      businessId: candidate.businessId,
      trustTier: 'fixture_only',
      publicStatus: 'published',
      suppressed: false,
      currentlyPublished: true,
    }),
    loadProviderConnection: async () => developmentProviderConnection(),
    catalogOriginIsCurrent: async (origin, businessId) => (
      businessId === candidate.businessId
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
      kind: 'found',
      ref: contract.ref,
      documentJson: JSON.stringify(contract),
      registeredAt: nowMs - 10_000,
    }),
    getExactRegisteredCapabilityContract: async () => ({
      kind: 'found',
      contract,
      registeredAt: nowMs - 10_000,
    }),
    patchProbeReadiness: async () => undefined,
    ...overrides,
  }
}

export async function quoteInputFor(ports = qualificationPorts()): Promise<SuppliedCandidateQuoteInput> {
  const qualification = await qualifySuppliedCandidate(ports, { candidate, now: nowMs })
  if (qualification.status !== 'eligible' || qualification.validUntil === undefined) {
    throw new Error(`Expected eligible fixture: ${qualification.reasons.join(',')}`)
  }
  return {
    target: candidate,
    qualificationDigest: qualification.qualificationDigest,
    qualificationValidUntil: qualification.validUntil,
    quoteRequest: {
      serviceReference: 'dev:service:aircon-assessment',
      requestedFields: ['price', 'validUntil', 'terms'],
      constraints: { suburb: 'Perth', timing: 'within 7 days' },
    },
    disclosure: {
      fields: [
        'quoteRequest.serviceReference',
        'quoteRequest.constraints.suburb',
        'quoteRequest.constraints.timing',
      ],
      limits: {
        'quoteRequest.serviceReference': 500,
        'quoteRequest.constraints.suburb': 120,
        'quoteRequest.constraints.timing': 120,
      },
      purpose: 'request_development_quote',
    },
    operationKey: 'dev:quote-operation:0001',
  }
}

export function inMemoryTracer(
  adapter: ReturnType<typeof vi.fn>,
  releaseSignal = createDevelopmentReleaseSignal(),
) {
  return createInMemoryActionInvocationTracer({
    action: collectSuppliedCandidateQuoteAction,
    now: nowIso,
    nextInvocationRef: () => `dev:invocation:${Math.random()}`,
    nextAuthorityRef: () => 'dev:authority:quote',
    nextAttemptRef: () => 'dev:attempt:quote',
    developmentReleaseSignal: releaseSignal,
  })
}
