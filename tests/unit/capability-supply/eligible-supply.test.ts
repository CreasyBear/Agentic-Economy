import { describe, expect, it } from 'vitest'

import {
  getEligibleExactCapabilitySupply,
  listIntegratedCapabilitySupply,
  listRouteableCapabilitySupply,
  MAX_ELIGIBLE_SUPPLY,
  type EligiblePublicationRow,
  type EligibleSupplyPorts,
} from '@/modules/capability-supply/internal/eligibility'
import {
  connectionAuthoritySnapshotFromProviderConnection,
  type CapabilityBindingRow,
} from '@/modules/capability-supply/internal/binding'
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
  providerConnectionAuthorityDigest,
  type CreateProviderConnectionCommand,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { pricingConfigDigest, type PricingConfig } from '@/modules/money/public'

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
  authority: { kind: 'provider_connection', connectionRef: 'connection:demo', providerRef: 'provider:demo' },
  continuation: { kind: 'single_response', evidenceRefs: ['evidence:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['evidence:binding'],
})

const providerConnectionCommand: CreateProviderConnectionCommand = {
  commandId: 'command:create:demo',
  connectionRef: 'connection:demo',
  businessId: 'business-1',
  providerRef: 'provider:demo',
  providerAccountRef: 'account:demo',
  adapterId: 'http-json:v1',
  credentialRef: 'env:DEMO_PROVIDER_SECRET',
  requestedScopes: ['demo:read'],
  grantedScopes: ['demo:read'],
  requestedResources: ['account:demo'],
  grantedResources: ['account:demo'],
  evidenceRefs: ['evidence:connection'],
}

function demoProviderConnection(
  overrides: Partial<Omit<ProviderConnection, 'authorityDigest'>> = {},
): ProviderConnection {
  const result = createProviderConnection(providerConnectionCommand, 1)
  if (result.kind !== 'applied') throw new Error(`provider connection fixture failed: ${result.kind}`)
  const connection = { ...result.connection, ...overrides }
  return { ...connection, authorityDigest: providerConnectionAuthorityDigest(connection) }
}

function publicationOperationRef(publicationRef: string, revision: number) {
  return createPublicOperationRef({
    operationId: capabilityOperationId(contractRef.capabilityId),
    publicationRef,
    publicationRevision: revision,
    contractRef,
  })
}

const admitted = {
  configJson: '{}',
  configDigest: canonicalDigest({}),
}
const pricingConfig: PricingConfig = {
  version: 'pricing:v2',
  unit: 'call',
  paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
}
const priceDigest = pricingConfigDigest(pricingConfig)

function currentPublication(
  overrides: Partial<Omit<EligiblePublicationRow, 'operationRef'>> = {},
  includeConnectionAuthority = true,
): EligiblePublicationRow {
  const publicationRef = overrides.publicationRef ?? 'pub-a'
  const revision = overrides.revision ?? 2
  const connectionAuthority = includeConnectionAuthority
    ? connectionAuthoritySnapshotFromProviderConnection(
      demoProviderConnection(),
      publicationOperationRef(publicationRef, revision),
    )
    : undefined
  return {
    publicationRef,
    revision,
    operationRef: publicationOperationRef(publicationRef, revision),
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
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
  const authority = overrides.authority ?? bindingRegistration.authority
  const registrationHash = capabilityBindingRegistrationHash({ ...bindingRegistration, authority }, admitted)
  const admissionEvidenceRefs = ['evidence:admission']
  const conformanceEvidenceRefs = ['evidence:conformance']
  const admission = overrides.admission ?? 'admitted'
  const conformance = overrides.conformance ?? 'conformant'
  const connectionAuthority = authority.kind === 'provider_connection'
    ? connectionAuthoritySnapshotFromProviderConnection(
      demoProviderConnection(),
      publicationOperationRef('pub-a', 2),
    )
    : undefined
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
    authority,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
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

function testQualification(
  candidate: Parameters<EligibleSupplyPorts['qualifySuppliedCandidate']>[0],
  now: number,
  reason?: 'readiness_stale' | 'source_integrity_failure',
) {
  const reasons = reason === undefined ? [] as const : [reason] as const
  return {
    kind: 'supplied_candidate_qualification' as const,
    environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE' as const,
    candidate,
    status: reason === undefined ? 'eligible' as const : 'blocked' as const,
    reasons,
    observedAt: now,
    qualificationDigest: canonicalDigest({ candidate, now, reasons }),
    sources: [],
  }
}

function emptyPorts(overrides: Partial<EligibleSupplyPorts> = {}): EligibleSupplyPorts {
  return {
    listAdmittedConformantBindingsByNetwork: async () => [],
    loadOfferingByOfferingId: async () => null,
    loadBindingByBindingId: async () => null,
    loadPublishedBusiness: async () => null,
    loadProviderConnection: async () => demoProviderConnection(),
    catalogOriginIsCurrent: async () => true,
    getActiveExactCapabilityContract: async () => ({ kind: 'unavailable', reason: 'not_found' }),
    qualifySuppliedCandidate: async (candidate, now) => testQualification(candidate, now),
    loadCurrentPublicationByBindingId: async () => currentPublication(),
    ...overrides,
  }
}

describe('capability-supply eligible inventory', () => {
  it('refuses invalid limits', async () => {
    expect(await listIntegratedCapabilitySupply(emptyPorts(), { networkId: 'ae:public', limit: 0, now: 1 }))
      .toEqual({ kind: 'unavailable', reason: 'limit_invalid' })
    expect(await listIntegratedCapabilitySupply(emptyPorts(), {
      networkId: 'ae:public', limit: MAX_ELIGIBLE_SUPPLY + 1, now: 1,
    })).toEqual({ kind: 'unavailable', reason: 'limit_invalid' })
  })

  it('refuses when admitted bindings exceed the requested limit', async () => {
    const binding = admittedBinding()
    const result = await listIntegratedCapabilitySupply(
      emptyPorts({
        listAdmittedConformantBindingsByNetwork: async () => [binding, { ...binding, bindingId: 'binding-b' }],
      }),
      { networkId: 'ae:public', limit: 1, now: 1 },
    )
    expect(result).toEqual({ kind: 'unavailable', reason: 'eligible_supply_limit_exceeded' })
  })

  it('fails closed on binding integrity failure', async () => {
    const result = await listIntegratedCapabilitySupply(
      emptyPorts({
        listAdmittedConformantBindingsByNetwork: async () => [
          admittedBinding({ registrationHash: `sha256:${'9'.repeat(64)}` }),
        ],
      }),
      { networkId: 'ae:public', limit: 8, now: 1 },
    )
    expect(result).toEqual({ kind: 'unavailable', reason: 'supply_integrity_failure' })
  })

  it('skips inactive offerings and unpublished businesses', async () => {
    const binding = admittedBinding()
    const inactive = activeOffering({ status: 'inactive' })
    const result = await listIntegratedCapabilitySupply(
      emptyPorts({
        listAdmittedConformantBindingsByNetwork: async () => [binding],
        loadOfferingByOfferingId: async () => inactive,
        loadPublishedBusiness: async () => null,
        getActiveExactCapabilityContract: async () => ({
          kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
        }),
      }),
      { networkId: 'ae:public', limit: 8, now: 1 },
    )
    expect(result).toEqual({ kind: 'available', supplies: [] })
  })

  it('attaches canonical active publication metadata and filters unpublished supply', async () => {
    const bindingA = admittedBinding()
    const offeringA = activeOffering()
    const offeringBRegistration = defineCapabilityOfferingRegistration({
      ...offeringRegistration,
      offeringId: 'offering-b',
    })
    const offeringBHash = capabilityOfferingRegistrationHash(offeringBRegistration)
    const offeringB = activeOffering({
      offeringId: 'offering-b',
      registrationHash: offeringBHash,
      eligibilityHash: capabilityOfferingEligibilityHash({
        offeringId: 'offering-b',
        registrationHash: offeringBHash,
        status: 'active',
        admissionEvidenceRefs: offeringA.admissionEvidenceRefs,
      }),
    })
    const bindingBRegistration = defineCapabilityTransportBindingRegistration({
      ...bindingRegistration,
      bindingId: 'binding-b',
      offeringId: 'offering-b',
    })
    const bindingBHash = capabilityBindingRegistrationHash(bindingBRegistration, admitted)
    const bindingB = admittedBinding({
      _id: 'row-2',
      bindingId: 'binding-b',
      offeringId: 'offering-b',
      registrationHash: bindingBHash,
      eligibilityHash: capabilityBindingEligibilityHash({
        bindingId: 'binding-b',
        registrationHash: bindingBHash,
        admission: 'admitted',
        conformance: 'conformant',
        admissionEvidenceRefs: bindingA.admissionEvidenceRefs,
        conformanceEvidenceRefs: bindingA.conformanceEvidenceRefs,
      }),
    })

    const result = await listIntegratedCapabilitySupply(
      emptyPorts({
        listAdmittedConformantBindingsByNetwork: async () => [bindingB, bindingA],
        loadOfferingByOfferingId: async (offeringId) => (
          offeringId === 'offering-a' ? offeringA : offeringB
        ),
        loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
        getActiveExactCapabilityContract: async () => ({
          kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
        }),
        loadCurrentPublicationByBindingId: async (bindingId) => (
          bindingId === 'binding-a'
            ? currentPublication()
            : null
        ),
      }),
      { networkId: 'ae:public', limit: 8, now: 100 },
    )
    if (result.kind !== 'available') throw new Error(`supply unavailable: ${result.reason}`)

    expect(result.supplies.map((supply) => supply.binding.bindingId)).toEqual(['binding-a', 'binding-b'])
    expect(result.supplies[0]?.publication).toMatchObject({
      publicationRef: 'pub-a',
      revision: 2,
      readinessValidUntil: 10_000,
      operationRef: createPublicOperationRef({
        operationId: capabilityOperationId(contractRef.capabilityId),
        publicationRef: 'pub-a',
        publicationRevision: 2,
        contractRef,
      }),
      admittedOperation: {
        operationId: capabilityOperationId(contractRef.capabilityId),
        publisherRef: 'publisher:demo',
        provenanceDigest: `sha256:${'3'.repeat(64)}`,
        businessId: 'business-1',
        publicationRef: 'pub-a',
        publicationRevision: 2,
        sourceRevision: 'source:revision:v1',
        sourceDigest: `sha256:${'2'.repeat(64)}`,
        contractRef,
        catalogOfferingRef: 'offering-a',
        catalogOfferingRevision: 1,
        offeringId: 'offering-a',
        offeringRegistrationHash: offeringA.registrationHash,
        offeringEligibilityHash: offeringA.eligibilityHash,
        bindingId: 'binding-a',
        bindingRegistrationHash: bindingA.registrationHash,
        bindingEligibilityHash: bindingA.eligibilityHash,
        bindingConfigDigest: bindingA.configDigest,
        readinessValidUntil: 10_000,
      },
    })

    const routeable = await listRouteableCapabilitySupply(
      emptyPorts({
        listAdmittedConformantBindingsByNetwork: async () => [bindingB, bindingA],
        loadOfferingByOfferingId: async (offeringId) => (
          offeringId === 'offering-a' ? offeringA : offeringB
        ),
        loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
        getActiveExactCapabilityContract: async () => ({
          kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
        }),
        loadCurrentPublicationByBindingId: async (bindingId) => (
          bindingId === 'binding-a'
            ? currentPublication()
            : null
        ),
      }),
      { networkId: 'ae:public', limit: 8, now: 100 },
    )
    expect(routeable.kind === 'available'
      ? routeable.supplies.map((supply) => supply.binding.bindingId)
      : []).toEqual(['binding-a'])
  })

  it('filters stale publication readiness from integrated and routeable supply', async () => {
    const binding = admittedBinding()
    const ports = emptyPorts({
      listAdmittedConformantBindingsByNetwork: async () => [binding],
      loadOfferingByOfferingId: async () => activeOffering(),
      loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
      getActiveExactCapabilityContract: async () => ({
        kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
      }),
      qualifySuppliedCandidate: async (candidate, now) => testQualification(candidate, now, 'readiness_stale'),
      loadCurrentPublicationByBindingId: async () => currentPublication({ readinessValidUntil: 100 }),
    })

    const integrated = await listIntegratedCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )
    const routeable = await listRouteableCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )
    const exact = await getEligibleExactCapabilitySupply(
      ports,
      {
        networkId: 'ae:public',
        businessId: 'business-1',
        offeringId: 'offering-a',
        bindingId: 'binding-a',
        contractRef,
        expectedOfferingRegistrationHash: activeOffering().registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        now: 100,
      },
    )

    expect(exact).toEqual({ kind: 'unavailable' })

    expect(integrated.kind).toBe('available')
    expect(integrated.kind === 'available' ? integrated.supplies : []).toHaveLength(1)
    expect(routeable).toEqual({ kind: 'available', supplies: [] })
  })
  it.each([
    ['reauthorized connection', demoProviderConnection({ authorityGeneration: 2 })],
    ['revoked connection', demoProviderConnection({ lifecycle: 'revoked' })],
    ['expired connection', demoProviderConnection({ expiresAt: 50 })],
  ] as const)('excludes provider supply after %s', async (_label, currentConnection) => {
    const persistedConnection = currentConnection.expiresAt === undefined
      ? demoProviderConnection()
      : currentConnection
    const connectionAuthority = connectionAuthoritySnapshotFromProviderConnection(
      persistedConnection,
      publicationOperationRef('pub-a', 2),
    )
    const binding = admittedBinding({ connectionAuthority })
    const offering = activeOffering()
    const ports = emptyPorts({
      listAdmittedConformantBindingsByNetwork: async () => [binding],
      loadOfferingByOfferingId: async () => offering,
      loadBindingByBindingId: async () => binding,
      loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
      loadProviderConnection: async () => currentConnection,
      getActiveExactCapabilityContract: async () => ({
        kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
      }),
      qualifySuppliedCandidate: async (candidate, now) => testQualification(candidate, now, 'source_integrity_failure'),
      loadCurrentPublicationByBindingId: async () => currentPublication({ connectionAuthority }),
    })

    const integrated = await listIntegratedCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )
    const routeable = await listRouteableCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )
    const exact = await getEligibleExactCapabilitySupply(
      ports,
      {
        networkId: 'ae:public',
        businessId: 'business-1',
        offeringId: 'offering-a',
        bindingId: 'binding-a',
        contractRef,
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        now: 100,
      },
    )

    expect(integrated.kind === 'available' ? integrated.supplies : []).toHaveLength(1)
    expect(routeable).toEqual({ kind: 'available', supplies: [] })
    expect(exact).toEqual({ kind: 'unavailable' })
  })

  it('keeps keyless supply eligible without a provider connection', async () => {
    const binding = admittedBinding({ authority: { kind: 'keyless' } })
    const offering = activeOffering()
    const publication = currentPublication({}, false)
    const ports = emptyPorts({
      listAdmittedConformantBindingsByNetwork: async () => [binding],
      loadOfferingByOfferingId: async () => offering,
      loadBindingByBindingId: async () => binding,
      loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
      loadProviderConnection: async () => undefined,
      getActiveExactCapabilityContract: async () => ({
        kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
      }),
      loadCurrentPublicationByBindingId: async () => publication,
    })

    const integrated = await listIntegratedCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )
    const routeable = await listRouteableCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )
    const exact = await getEligibleExactCapabilitySupply(
      ports,
      {
        networkId: 'ae:public',
        businessId: 'business-1',
        offeringId: 'offering-a',
        bindingId: 'binding-a',
        contractRef,
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        now: 100,
      },
    )

    expect(binding.connectionAuthority).toBeUndefined()
    expect(publication.connectionAuthority).toBeUndefined()
    expect(integrated.kind === 'available' ? integrated.supplies : []).toHaveLength(1)
    expect(routeable.kind === 'available' ? routeable.supplies : []).toHaveLength(1)
    expect(exact.kind).toBe('available')
  })
  it('excludes provider supply when connection reader returns absence', async () => {
    const binding = admittedBinding()
    const offering = activeOffering()
    const ports = emptyPorts({
      listAdmittedConformantBindingsByNetwork: async () => [binding],
      loadOfferingByOfferingId: async () => offering,
      loadBindingByBindingId: async () => binding,
      loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
      loadProviderConnection: async () => undefined,
      getActiveExactCapabilityContract: async () => ({
        kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
      }),
      qualifySuppliedCandidate: async (candidate, now) => testQualification(candidate, now, 'source_integrity_failure'),
      loadCurrentPublicationByBindingId: async () => currentPublication(),
    })

    const integrated = await listIntegratedCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )
    const exact = await getEligibleExactCapabilitySupply(ports, {
      networkId: 'ae:public',
      businessId: 'business-1',
      offeringId: 'offering-a',
      bindingId: 'binding-a',
      contractRef,
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      now: 100,
    })

    expect(integrated.kind === 'available' ? integrated.supplies : []).toHaveLength(1)
    expect(exact).toEqual({ kind: 'unavailable' })
  })

  it('exact supply hits when hashes and published business match', async () => {
    const offering = activeOffering()
    const binding = admittedBinding()
    const result = await getEligibleExactCapabilitySupply(
      emptyPorts({
        loadOfferingByOfferingId: async () => offering,
        loadBindingByBindingId: async () => binding,
        loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
        getActiveExactCapabilityContract: async () => ({
          kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
        }),
        loadCurrentPublicationByBindingId: async () => currentPublication(),
      }),
      {
        networkId: 'ae:public',
        businessId: 'business-1',
        offeringId: 'offering-a',
        bindingId: 'binding-a',
        contractRef,
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        now: 100,
      },
    )
    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.offering.offeringId).toBe('offering-a')
    expect(result.binding.bindingId).toBe('binding-a')
    expect(result.business.businessId).toBe('business-1')
  })

  it('exact supply misses on hash mismatch or unpublished business', async () => {
    const offering = activeOffering()
    const binding = admittedBinding()
    const missHash = await getEligibleExactCapabilitySupply(
      emptyPorts({
        loadOfferingByOfferingId: async () => offering,
        loadBindingByBindingId: async () => binding,
        loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
        getActiveExactCapabilityContract: async () => ({
          kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
        }),
      }),
      {
        networkId: 'ae:public',
        businessId: 'business-1',
        offeringId: 'offering-a',
        bindingId: 'binding-a',
        contractRef,
        expectedOfferingRegistrationHash: `sha256:${'9'.repeat(64)}`,
        expectedBindingRegistrationHash: binding.registrationHash,
        now: 100,
      },
    )
    expect(missHash).toEqual({ kind: 'unavailable' })

    const missBusiness = await getEligibleExactCapabilitySupply(
      emptyPorts({
        loadOfferingByOfferingId: async () => offering,
        loadBindingByBindingId: async () => binding,
        loadPublishedBusiness: async () => null,
        getActiveExactCapabilityContract: async () => ({
          kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
        }),
      }),
      {
        networkId: 'ae:public',
        businessId: 'business-1',
        offeringId: 'offering-a',
        bindingId: 'binding-a',
        contractRef,
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        now: 100,
      },
    )
    expect(missBusiness).toEqual({ kind: 'unavailable' })
  })
})
