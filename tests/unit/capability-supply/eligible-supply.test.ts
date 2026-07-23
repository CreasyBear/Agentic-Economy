import { describe, expect, it } from 'vitest'

import {
  getEligibleExactCapabilitySupply,
  listIntegratedCapabilitySupply,
  listEligibleCapabilitySupply,
  listRouteableCapabilitySupply,
  MAX_ELIGIBLE_SUPPLY,
  type EligibleSupplyPorts,
} from '@/modules/capability-supply/internal/eligibility'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

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
  credentialRef: 'credential:demo',
  continuation: { kind: 'single_response', evidenceRefs: ['evidence:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['evidence:binding'],
})

const admitted = {
  configJson: '{}',
  configDigest: canonicalDigest({}),
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
    credentialRef: bindingRegistration.credentialRef,
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

function emptyPorts(overrides: Partial<EligibleSupplyPorts> = {}): EligibleSupplyPorts {
  return {
    listAdmittedConformantBindingsByNetwork: async () => [],
    loadOfferingByOfferingId: async () => null,
    loadBindingByBindingId: async () => null,
    loadPublishedBusiness: async () => null,
    catalogOriginIsCurrent: async () => true,
    getActiveExactCapabilityContract: async () => ({ kind: 'unavailable', reason: 'not_found' }),
    loadCurrentPublicationByBindingId: async () => null,
    ...overrides,
  }
}

describe('capability-supply eligible inventory', () => {
  it('refuses invalid limits', async () => {
    expect(await listEligibleCapabilitySupply(emptyPorts(), { networkId: 'ae:public', limit: 0 }))
      .toEqual({ kind: 'unavailable', reason: 'limit_invalid' })
    expect(await listEligibleCapabilitySupply(emptyPorts(), {
      networkId: 'ae:public', limit: MAX_ELIGIBLE_SUPPLY + 1,
    })).toEqual({ kind: 'unavailable', reason: 'limit_invalid' })
  })

  it('refuses when admitted bindings exceed the requested limit', async () => {
    const binding = admittedBinding()
    const result = await listEligibleCapabilitySupply(
      emptyPorts({
        listAdmittedConformantBindingsByNetwork: async () => [binding, { ...binding, bindingId: 'binding-b' }],
      }),
      { networkId: 'ae:public', limit: 1 },
    )
    expect(result).toEqual({ kind: 'unavailable', reason: 'eligible_supply_limit_exceeded' })
  })

  it('fails closed on binding integrity failure', async () => {
    const result = await listEligibleCapabilitySupply(
      emptyPorts({
        listAdmittedConformantBindingsByNetwork: async () => [
          admittedBinding({ registrationHash: `sha256:${'9'.repeat(64)}` }),
        ],
      }),
      { networkId: 'ae:public', limit: 8 },
    )
    expect(result).toEqual({ kind: 'unavailable', reason: 'supply_integrity_failure' })
  })

  it('skips inactive offerings and unpublished businesses', async () => {
    const binding = admittedBinding()
    const inactive = activeOffering({ status: 'inactive' })
    const result = await listEligibleCapabilitySupply(
      emptyPorts({
        listAdmittedConformantBindingsByNetwork: async () => [binding],
        loadOfferingByOfferingId: async () => inactive,
        loadPublishedBusiness: async () => null,
        getActiveExactCapabilityContract: async () => ({
          kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
        }),
      }),
      { networkId: 'ae:public', limit: 8 },
    )
    expect(result).toEqual({ kind: 'available', supplies: [] })
  })

  it('attaches active publication metadata and sorts stably', async () => {
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

    const result = await listEligibleCapabilitySupply(
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
            ? {
                publicationRef: 'pub-a',
                revision: 2,
                disposition: 'current',
                credentialState: 'ready',
                healthState: 'healthy',
                readinessValidUntil: 10_000,
                readinessObservedAt: 1,
              }
            : null
        ),
      }),
      { networkId: 'ae:public', limit: 8, now: 100 },
    )

    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.supplies.map((supply) => supply.binding.bindingId)).toEqual(['binding-a', 'binding-b'])
    expect(result.supplies[0]?.publication).toEqual({
      publicationRef: 'pub-a', revision: 2, readinessValidUntil: 10_000,
    })
    expect(result.supplies[1]?.publication).toBeUndefined()

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
            ? {
                publicationRef: 'pub-a', revision: 2, disposition: 'current',
                credentialState: 'ready', healthState: 'healthy',
                readinessValidUntil: 10_000, readinessObservedAt: 1,
              }
            : null
        ),
      }),
      { networkId: 'ae:public', limit: 8, now: 100 },
    )
    expect(routeable.kind === 'available'
      ? routeable.supplies.map((supply) => supply.binding.bindingId)
      : []).toEqual(['binding-a'])
  })

  it('separates integrated supply from supply that is currently routeable', async () => {
    const binding = admittedBinding()
    const ports = emptyPorts({
      listAdmittedConformantBindingsByNetwork: async () => [binding],
      loadOfferingByOfferingId: async () => activeOffering(),
      loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
      getActiveExactCapabilityContract: async () => ({
        kind: 'found', ref: contractRef, documentJson: '{}', registeredAt: 1,
      }),
      loadCurrentPublicationByBindingId: async () => null,
    })

    const integrated = await listIntegratedCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )
    const routeable = await listRouteableCapabilitySupply(
      ports, { networkId: 'ae:public', limit: 8, now: 100 },
    )

    expect(integrated.kind).toBe('available')
    expect(integrated.kind === 'available' ? integrated.supplies : []).toHaveLength(1)
    expect(routeable).toEqual({ kind: 'available', supplies: [] })
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
      }),
      {
        networkId: 'ae:public',
        businessId: 'business-1',
        offeringId: 'offering-a',
        bindingId: 'binding-a',
        contractRef,
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
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
      },
    )
    expect(missBusiness).toEqual({ kind: 'unavailable' })
  })
})
