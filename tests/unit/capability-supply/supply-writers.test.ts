import { describe, expect, it } from 'vitest'

import {
  connectionAuthoritySnapshotFromProviderConnection,
  registerCapabilityTransportBinding,
  type BindingInsertRow,
  type BindingWritePorts,
  type CapabilityBindingRow,
} from '@/modules/capability-supply/internal/binding'
import {
  setCapabilitySupplyEligibility,
  type EligibilityWritePorts,
} from '@/modules/capability-supply/internal/eligibility'
import {
  registerCapabilityOffering,
  type CapabilityOfferingRow,
  type OfferingInsertRow,
  type OfferingWritePorts,
} from '@/modules/capability-supply/internal/offering'
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
    summary: 'Demo offering',
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
  adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
  registrationEvidenceRefs: ['evidence:binding'],
})

const admittedTransport = {
  adapterId: 'http-json:v1',
  configJson: '{"method":"POST","requestTimeoutMs":5000}',
  configDigest: canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 }),
}
const operationRef = createPublicOperationRef({
  operationId: capabilityOperationId(contractRef.capabilityId),
  publicationRef: offeringRegistration.offeringId,
  publicationRevision: 1,
  contractRef,
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

function demoProviderConnection(now = 1): ProviderConnection {
  const result = createProviderConnection(providerConnectionCommand, now)
  if (result.kind !== 'applied') throw new Error(`provider connection fixture failed: ${result.kind}`)
  return result.connection
}
function inactiveOffering(overrides: Partial<CapabilityOfferingRow> = {}): CapabilityOfferingRow {
  const registrationHash = capabilityOfferingRegistrationHash(offeringRegistration)
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
    status: 'inactive',
    admissionEvidenceRefs: [],
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: offeringRegistration.offeringId,
      registrationHash,
      status: 'inactive',
      admissionEvidenceRefs: [],
    }),
    registeredAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function inactiveBinding(overrides: Partial<CapabilityBindingRow> = {}): CapabilityBindingRow {
  const registrationHash = capabilityBindingRegistrationHash(bindingRegistration, admittedTransport)
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
    connectionAuthority: connectionAuthoritySnapshotFromProviderConnection(
      demoProviderConnection(),
      operationRef,
    ),
    continuation: bindingRegistration.continuation,
    cancellation: bindingRegistration.cancellation,
    adapterId: admittedTransport.adapterId,
    configJson: admittedTransport.configJson,
    configDigest: admittedTransport.configDigest,
    registrationEvidenceRefs: bindingRegistration.registrationEvidenceRefs,
    registrationHash,
    admission: 'not_admitted',
    conformance: 'not_conformant',
    admissionEvidenceRefs: [],
    conformanceEvidenceRefs: [],
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: bindingRegistration.bindingId,
      registrationHash,
      admission: 'not_admitted',
      conformance: 'not_conformant',
      admissionEvidenceRefs: [],
      conformanceEvidenceRefs: [],
    }),
    registeredAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function offeringPorts(overrides: Partial<OfferingWritePorts> = {}): OfferingWritePorts {
  return {
    loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
    resolveExactContract: async () => ({ kind: 'found' }),
    loadOfferingByOfferingId: async () => null,
    insertOffering: async () => {},
    ...overrides,
  }
}

function bindingPorts(overrides: Partial<BindingWritePorts> = {}): BindingWritePorts {
  return {
    loadOfferingByOfferingId: async () => inactiveOffering(),
    loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
    loadProviderConnection: async () => demoProviderConnection(),
    resolveExactContract: async () => ({ kind: 'found' }),
    loadBindingByBindingId: async () => null,
    insertBinding: async () => {},
    ...overrides,
  }
}

function eligibilityPorts(overrides: Partial<EligibilityWritePorts> = {}): EligibilityWritePorts {
  return {
    loadOfferingByOfferingId: async () => inactiveOffering(),
    loadBindingByBindingId: async () => inactiveBinding(),
    listAdmittedConformantBindings: async () => [],
    resolveExactContract: async () => ({ kind: 'found' }),
    loadPublishedBusiness: async () => ({ businessId: 'business-1' }),
    loadProviderConnection: async () => demoProviderConnection(),
    patchOfferingEligibility: async () => {},
    patchBindingEligibility: async () => {},
    ...overrides,
  }
}

describe('capability-supply supply writers', () => {
  it('registers a new offering and idempotently replays the same hash', async () => {
    const inserted: OfferingInsertRow[] = []
    const created = await registerCapabilityOffering(
      offeringPorts({
        insertOffering: async (row) => { inserted.push(row) },
      }),
      offeringRegistration,
      10,
    )
    expect(created).toMatchObject({
      kind: 'registered',
      offeringId: 'offering-a',
      created: true,
    })
    expect(inserted).toHaveLength(1)

    const replay = await registerCapabilityOffering(
      offeringPorts({
        loadOfferingByOfferingId: async () => inactiveOffering({
          registrationHash: created.kind === 'registered' ? created.registrationHash : '',
        }),
      }),
      offeringRegistration,
      10,
    )
    expect(replay).toEqual({
      kind: 'registered',
      offeringId: 'offering-a',
      registrationHash: created.kind === 'registered' ? created.registrationHash : '',
      created: false,
    })
  })

  it('refuses offering registration when business is unpublished', async () => {
    const result = await registerCapabilityOffering(
      offeringPorts({ loadPublishedBusiness: async () => null }),
      offeringRegistration,
      10,
    )
    expect(result).toEqual({ kind: 'refused', reason: 'business_not_registered' })
  })

  it('registers a binding against a matching offering', async () => {
    const inserted: BindingInsertRow[] = []
    const result = await registerCapabilityTransportBinding(
      bindingPorts({
        insertBinding: async (row) => { inserted.push(row) },
      }),
      bindingRegistration,
      20,
    )
    expect(result).toMatchObject({
      kind: 'registered',
      bindingId: 'binding-a',
      created: true,
    })
    expect(inserted[0]?.adapterId).toBe('http-json:v1')
  })

  it('refuses a provider connection that expired before binding registration', async () => {
    const created = createProviderConnection({ ...providerConnectionCommand, expiresAt: 10 }, 1)
    if (created.kind !== 'applied') throw new Error(`provider connection fixture failed: ${created.kind}`)
    await expect(registerCapabilityTransportBinding(
      bindingPorts({ loadProviderConnection: async () => created.connection }),
      bindingRegistration,
      20,
    )).resolves.toEqual({ kind: 'refused', reason: 'connection_inactive' })
  })

  it('refuses binding when offering contract mismatches', async () => {
    const mismatched = defineCapabilityTransportBindingRegistration({
      ...bindingRegistration,
      contractRef: {
        ...contractRef,
        capabilityId: 'other.cap',
      },
    })
    const result = await registerCapabilityTransportBinding(
      bindingPorts(),
      mismatched,
      20,
    )
    expect(result).toEqual({ kind: 'refused', reason: 'offering_binding_mismatch' })
  })

  it('admits eligibility and patches offering plus binding', async () => {
    const offering = inactiveOffering()
    const binding = inactiveBinding()
    const patches: Array<{ target: string; status?: string; admission?: string }> = []
    const result = await setCapabilitySupplyEligibility(
      eligibilityPorts({
        loadOfferingByOfferingId: async () => offering,
        loadBindingByBindingId: async () => binding,
        patchOfferingEligibility: async (_id, patch) => {
          patches.push({ target: 'offering', status: patch.status })
        },
        patchBindingEligibility: async (_id, patch) => {
          patches.push({ target: 'binding', admission: patch.admission })
        },
      }),
      {
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef,
        decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['evidence:admission'],
        conformanceEvidenceRefs: ['evidence:conformance'],
      },
      30,
    )
    expect(result).toMatchObject({
      kind: 'eligible',
      offeringId: 'offering-a',
      bindingId: 'binding-a',
      transition: {
        offeringBefore: 'inactive',
        offeringAfter: 'active',
        bindingBefore: 'not_admitted:not_conformant',
        bindingAfter: 'admitted:conformant',
      },
    })
    expect(patches).toEqual([
      { target: 'offering', status: 'active' },
      { target: 'binding', admission: 'admitted' },
    ])
  })

  it('refuses eligibility when registration hashes changed', async () => {
    const offering = inactiveOffering()
    const binding = inactiveBinding()
    const result = await setCapabilitySupplyEligibility(
      eligibilityPorts({
        loadOfferingByOfferingId: async () => offering,
        loadBindingByBindingId: async () => binding,
      }),
      {
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef,
        decision: 'admit',
        expectedOfferingRegistrationHash: `sha256:${'9'.repeat(64)}`,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['evidence:admission'],
        conformanceEvidenceRefs: ['evidence:conformance'],
      },
      30,
    )
    expect(result).toEqual({ kind: 'refused', reason: 'registration_changed' })
  })
})
