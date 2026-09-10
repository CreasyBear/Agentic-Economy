import { describe, expect, it } from 'vitest'

import {
  listIntegratedCapabilitySupply,
  listRouteableCapabilitySupply,
  type EligiblePublicationRow,
  type EligibleSupplyPorts,
  type CapabilityBindingRow,
  type CapabilityOfferingRow,
  publicationLifecycle,
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityToolId,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  createPublicToolRef,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { pricingConfigDigest, type PricingConfig } from '@/modules/money/public'

/**
 * Regression parity fixture for C7b (Well 4): `listRouteableCapabilitySupply`
 * must admit exactly the rows whose `availability(...).posture === 'routeable'`
 * (see `internal/eligibility/list.ts`'s `routeableAvailabilityInput`), so Quote
 * and presentation (`internal/availability.ts`) can never disagree about
 * whether a Tool is callable.
 *
 * `legacyRouteablePredicate` below is copied verbatim from the boolean gate
 * `listRouteableCapabilitySupply` used before this change:
 * `supply.publication === undefined ? [] : [supply]`. This test proves the
 * new posture-based gate admits the same set of rows across every lifecycle
 * state a publication can be in.
 */
function legacyRouteablePredicate(supply: Readonly<{ publication?: unknown }>): boolean {
  return supply.publication !== undefined
}

const contractRef = {
  capabilityId: 'cap.demo',
  version: 1,
  contractDigest: `sha256:${'1'.repeat(64)}`,
}

const offeringRegistration = defineCapabilityOfferingRegistration({
  offeringId: 'offering-a',
  businessId: 'business-1',
  networkId: 'ae:public',
  contractRef,
  presentation: {
    label: 'Demo',
    summary: 'Demo',
    price: { kind: 'on_request' },
    materialTerms: [],
    commercialRelationship: {
      kind: 'none',
      summary: 'Independent',
      influencesEligibility: false,
      influencesInclusion: false,
      influencesOrder: false,
      evidenceRefs: ['evidence:commercial'],
    },
  },
  searchTerms: ['demo'],
  registrationEvidenceRefs: ['evidence:registration'],
})

const bindingRegistration = defineCapabilityTransportBindingRegistration({
  bindingId: 'binding-a',
  offeringId: 'offering-a',
  networkId: 'ae:public',
  contractRef,
  endpointUrl: 'https://example.test/api',
  authority: { kind: 'public_upstream' },
  continuation: { kind: 'single_response', evidenceRefs: ['evidence:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['evidence:binding'],
})

const admitted = { configJson: '{}', configDigest: canonicalDigest({}) }
const pricingConfig: PricingConfig = {
  version: 'pricing:v3',
  kind: 'fixed_aud',
  currency: 'AUD',
  exponent: 6,
  amountUnits: '12000000',
}
const priceDigest = pricingConfigDigest(pricingConfig)

function publicationToolRef(publicationRef: string, revision: number) {
  return createPublicToolRef({
    operationId: capabilityToolId(contractRef.capabilityId),
    publicationRef,
    publicationRevision: revision,
    contractRef,
  })
}

function activeOffering(overrides: Partial<CapabilityOfferingRow> = {}): CapabilityOfferingRow {
  const registrationHash = capabilityOfferingRegistrationHash(offeringRegistration)
  const admissionEvidenceRefs = ['evidence:admission']
  const status = overrides.status ?? 'active'
  return {
    offeringId: offeringRegistration.offeringId,
    businessId: offeringRegistration.businessId,
    networkId: offeringRegistration.networkId,
    capabilityId: contractRef.capabilityId,
    version: contractRef.version,
    contractDigest: contractRef.contractDigest,
    presentation: offeringRegistration.presentation,
    searchTerms: offeringRegistration.searchTerms,
    registrationEvidenceRefs: offeringRegistration.registrationEvidenceRefs,
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: offeringRegistration.offeringId,
      registrationHash,
      status,
      admissionEvidenceRefs,
    }),
    registeredAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function admittedBinding(overrides: Partial<CapabilityBindingRow> = {}): CapabilityBindingRow {
  const registrationHash = capabilityBindingRegistrationHash(bindingRegistration, admitted)
  const admissionEvidenceRefs = ['evidence:admission']
  const conformanceEvidenceRefs = ['evidence:conformance']
  const admission = overrides.admission ?? 'admitted'
  const conformance = overrides.conformance ?? 'conformant'
  return {
    _id: 'row-1',
    _creationTime: 1,
    bindingId: bindingRegistration.bindingId,
    offeringId: bindingRegistration.offeringId,
    networkId: bindingRegistration.networkId,
    capabilityId: contractRef.capabilityId,
    version: contractRef.version,
    contractDigest: contractRef.contractDigest,
    endpointUrl: bindingRegistration.endpointUrl,
    authority: bindingRegistration.authority,
    continuation: bindingRegistration.continuation,
    cancellation: bindingRegistration.cancellation,
    adapterId: bindingRegistration.adapter.adapterId,
    configJson: admitted.configJson,
    configDigest: admitted.configDigest,
    registrationEvidenceRefs: bindingRegistration.registrationEvidenceRefs,
    registrationHash,
    admission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: bindingRegistration.bindingId,
      registrationHash,
      admission,
      conformance,
      admissionEvidenceRefs,
      conformanceEvidenceRefs,
    }),
    registeredAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function currentPublication(
  overrides: Partial<Omit<EligiblePublicationRow, 'toolRef'>> = {},
): EligiblePublicationRow {
  const publicationRef = overrides.publicationRef ?? 'pub-a'
  const revision = overrides.revision ?? 2
  return {
    publicationRef,
    revision,
    toolRef: publicationToolRef(publicationRef, revision),
    businessId: 'business-1',
    networkId: 'ae:public',
    capabilityId: contractRef.capabilityId,
    version: contractRef.version,
    contractDigest: contractRef.contractDigest,
    offeringId: 'offering-a',
    bindingId: 'binding-a',
    sourceRevision: 'source:revision:v1',
    sourceDigest: `sha256:${'2'.repeat(64)}`,
    publisherRef: 'publisher:demo',
    provenanceDigest: `sha256:${'3'.repeat(64)}`,
    registrationEvidenceRefs: ['evidence:publication'],
    readinessEvidenceRefs: ['evidence:readiness'],
    disposition: 'current',
    credentialState: 'ready',
    healthState: 'healthy',
    pricingConfig,
    priceDigest,
    readinessValidUntil: 10_000,
    readinessObservedAt: 1,
    ...overrides,
  }
}

function testQualification(
  candidate: Parameters<EligibleSupplyPorts['qualifySuppliedCandidate']>[0],
  now: number,
  eligible: boolean,
) {
  const reasons = eligible ? [] as const : ['readiness_stale' as const]
  return {
    kind: 'supplied_candidate_qualification' as const,
    environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE' as const,
    candidate,
    status: eligible ? 'eligible' as const : 'blocked' as const,
    reasons,
    observedAt: now,
    qualificationDigest: canonicalDigest({ candidate, now, eligible }),
    sources: [],
  }
}

/**
 * The real `qualifySuppliedCandidate` (production) blocks a candidate whose
 * publication isn't `disposition: 'current'` via its own direct check, and
 * separately folds admission/conformance/credential/health/authority signals
 * through `publicationLifecycle`. Reusing `publicationLifecycle` here (rather
 * than re-deriving those rules) keeps the mocked "old" gate faithful to
 * production without duplicating its logic.
 */
function legacyWouldQualify(
  publication: EligiblePublicationRow,
  offering: CapabilityOfferingRow,
  binding: CapabilityBindingRow,
  now: number,
): boolean {
  return publication.disposition === 'current'
    && publicationLifecycle(publication, offering, binding, now).state === 'active'
}

function portsFor(
  offering: CapabilityOfferingRow,
  binding: CapabilityBindingRow,
  publication: EligiblePublicationRow,
  now: number,
): EligibleSupplyPorts {
  const eligible = legacyWouldQualify(publication, offering, binding, now)
  return {
    listAdmittedConformantBindingsByNetwork: async () => [binding],
    loadOfferingByOfferingId: async () => offering,
    loadBindingByBindingId: async () => binding,
    loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
    loadProviderConnection: async () => undefined,
    catalogOriginIsCurrent: async () => true,
    getActiveExactCapabilityContract: async () => ({
      kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
    }),
    qualifySuppliedCandidate: async (candidate, qualifyNow) => testQualification(candidate, qualifyNow, eligible),
    loadCurrentPublicationByBindingId: async () => publication,
  }
}

type LifecycleFixture = Readonly<{
  name: string
  offering?: Partial<CapabilityOfferingRow>
  binding?: Partial<CapabilityBindingRow>
  publication?: Partial<Omit<EligiblePublicationRow, 'toolRef'>>
  expectRouteable: boolean
}>

const now = 100

const fixtures: readonly LifecycleFixture[] = [
  {
    name: 'draft / unobserved readiness',
    publication: {
      credentialState: 'unobserved', healthState: 'unobserved',
      readinessObservedAt: undefined, readinessValidUntil: undefined,
    },
    expectRouteable: false,
  },
  {
    name: 'ready + healthy + valid',
    publication: { credentialState: 'ready', healthState: 'healthy', readinessObservedAt: 1, readinessValidUntil: 10_000 },
    expectRouteable: true,
  },
  {
    name: 'expired validity',
    publication: { readinessValidUntil: 50 },
    expectRouteable: false,
  },
  {
    name: 'withdrawn',
    publication: { disposition: 'withdrawn' },
    expectRouteable: false,
  },
  {
    name: 'incompatible',
    publication: { disposition: 'incompatible' },
    expectRouteable: false,
  },
  {
    name: 'superseded',
    publication: { disposition: 'superseded' },
    expectRouteable: false,
  },
  {
    name: 'review_required authority',
    publication: { sourceAuthorityState: 'review_required' },
    expectRouteable: false,
  },
  {
    name: 'not_admitted',
    binding: { admission: 'not_admitted' },
    expectRouteable: false,
  },
  {
    name: 'paused (unhealthy)',
    publication: { healthState: 'unhealthy' },
    expectRouteable: false,
  },
]

describe('listRouteableCapabilitySupply availability parity', () => {
  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    'legacy publication-presence gate and the new availability(...) posture gate agree: %s',
    async (_name, fixture) => {
      const offering = activeOffering(fixture.offering)
      const binding = admittedBinding(fixture.binding)
      const publication = currentPublication(fixture.publication)
      const ports = portsFor(offering, binding, publication, now)

      const integrated = await listIntegratedCapabilitySupply(ports, { networkId: 'ae:public', limit: 8, now })
      if (integrated.kind !== 'available') throw new Error(`integrated unavailable: ${integrated.reason}`)
      const legacyAdmitted = integrated.supplies.filter(legacyRouteablePredicate).map((s) => s.binding.bindingId)

      const routeableResult = await listRouteableCapabilitySupply(ports, { networkId: 'ae:public', limit: 8, now })
      if (routeableResult.kind !== 'available') throw new Error(`routeable unavailable: ${routeableResult.reason}`)
      const newAdmitted = routeableResult.supplies.map((s) => s.binding.bindingId)

      // Parity: the old boolean gate and the new posture gate must admit the
      // exact same set of rows for every lifecycle state in this corpus.
      expect(newAdmitted).toEqual(legacyAdmitted)
      expect(newAdmitted).toEqual(fixture.expectRouteable ? ['binding-a'] : [])
    },
  )
})
