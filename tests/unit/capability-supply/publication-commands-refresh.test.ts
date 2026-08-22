import { describe, expect, it, vi } from 'vitest'

import {
  admitPublicationDraft,
  refreshCapabilityCommand,
  type PublicationCommandPorts,
} from '@/modules/capability-supply/internal/publication'
import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  capabilityPublicationProvenanceDigest,
  createPublicOperationRef,
} from '@/modules/capability-supply/public'
import {
  connectionAuthoritySnapshotFromProviderConnection,
  type CapabilityBindingRow,
} from '@/modules/capability-supply/internal/binding'
import {
  rotateCapabilityTransportBindingAuthority,
  type RotateCapabilityTransportBindingAuthorityPatch,
} from '@/modules/capability-supply/internal/binding/write'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import {
  providerConnectionAuthorityDigest,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import * as publicationImporters from '@/modules/capability-supply/internal/publication-importers'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

import {
  bindingDraft,
  context,
  currentPublication,
  digest,
  emptyPorts,
  encodedFor,
  offeringDraft,
  preparedPublication,
  publicationSource,
  supplyRows,
} from './publication-commands-harness'

type RotationFixture = Readonly<{
  offering: CapabilityOfferingRow
  binding: CapabilityBindingRow
  connection: ProviderConnection
  previousAuthority: NonNullable<CapabilityBindingRow['connectionAuthority']>
  previousOperationRef: ReturnType<typeof createPublicOperationRef>
  nextOperationRef: ReturnType<typeof createPublicOperationRef>
}>

async function rotationFixture(): Promise<RotationFixture> {
  const prepared = await preparedPublication()
  const admitted = await admitPublicationDraft({ prepared, businessId: 'business-1' })
  if ('reason' in admitted) throw new Error(`rotation_fixture_refused:${admitted.reason}`)
  const contractRef = admitted.encoded.contract.ref
  const previousOperationRef = createPublicOperationRef({
    operationId: capabilityOperationId(contractRef.capabilityId),
    publicationRef: admitted.offering.offeringId,
    publicationRevision: 1,
    contractRef,
  })
  const nextOperationRef = createPublicOperationRef({
    operationId: capabilityOperationId(contractRef.capabilityId),
    publicationRef: admitted.offering.offeringId,
    publicationRevision: 2,
    contractRef,
  })
  const connectionWithoutDigest: Omit<ProviderConnection, 'authorityDigest'> = {
    connectionRef: 'connection:demo',
    businessId: 'business-1',
    providerRef: 'provider:demo',
    providerAccountRef: 'account:demo',
    adapterId: admitted.binding.adapter.adapterId,
    credentialRef: null,
    grantedScopes: [],
    grantedResources: [],
    authorityGeneration: 1,
    lifecycle: 'active',
    observedAt: 1,
    createdAt: 1,
    updatedAt: 1,
    evidenceRefs: ['evidence:connection'],
  }
  const connection: ProviderConnection = {
    ...connectionWithoutDigest,
    authorityDigest: providerConnectionAuthorityDigest(connectionWithoutDigest),
  }
  const previousAuthority = connectionAuthoritySnapshotFromProviderConnection(
    connection,
    previousOperationRef,
  )
  const offering: CapabilityOfferingRow = {
    offeringId: admitted.offering.offeringId,
    businessId: 'business-1',
    networkId: admitted.offering.networkId,
    capabilityId: contractRef.capabilityId,
    version: contractRef.version,
    contractDigest: contractRef.contractDigest,
    presentation: admitted.offering.presentation,
    searchTerms: admitted.offering.searchTerms,
    registrationEvidenceRefs: admitted.offering.registrationEvidenceRefs,
    registrationHash: capabilityOfferingRegistrationHash(admitted.offering),
    status: 'inactive',
    admissionEvidenceRefs: [],
    eligibilityHash: digest,
    registeredAt: 1,
    updatedAt: 1,
  }
  const binding: CapabilityBindingRow = {
    _id: 'binding-row',
    _creationTime: 1,
    bindingId: admitted.binding.bindingId,
    offeringId: admitted.binding.offeringId,
    networkId: admitted.binding.networkId,
    capabilityId: contractRef.capabilityId,
    version: contractRef.version,
    contractDigest: contractRef.contractDigest,
    endpointUrl: admitted.binding.endpointUrl,
    authority: admitted.binding.authority,
    connectionAuthority: previousAuthority,
    continuation: admitted.binding.continuation,
    cancellation: admitted.binding.cancellation,
    adapterId: admitted.binding.adapter.adapterId,
    configJson: admitted.admittedTransport.transport.configJson,
    configDigest: admitted.admittedTransport.transport.configDigest,
    registrationEvidenceRefs: admitted.binding.registrationEvidenceRefs,
    registrationHash: capabilityBindingRegistrationHash(
      admitted.binding,
      admitted.admittedTransport.transport,
    ),
    admission: 'not_admitted',
    conformance: 'not_conformant',
    admissionEvidenceRefs: [],
    conformanceEvidenceRefs: [],
    eligibilityHash: digest,
    registeredAt: 1,
    updatedAt: 1,
  }
  return { offering, binding, connection, previousAuthority, previousOperationRef, nextOperationRef }
}

function rotationInput(fixture: RotationFixture) {
  return {
    bindingId: fixture.binding.bindingId,
    offeringId: fixture.offering.offeringId,
    businessId: fixture.offering.businessId,
    registrationHash: fixture.binding.registrationHash,
    connectionRef: fixture.connection.connectionRef,
    providerRef: fixture.connection.providerRef,
    adapterId: fixture.connection.adapterId,
    previousAuthority: fixture.previousAuthority,
    previousOperationRef: fixture.previousOperationRef,
    nextOperationRef: fixture.nextOperationRef,
  }
}

function rotationPorts(
  fixture: RotationFixture,
  patches: RotateCapabilityTransportBindingAuthorityPatch[],
  connection = fixture.connection,
) {
  return {
    loadOfferingByOfferingId: async () => fixture.offering,
    loadPublishedBusiness: async () => ({ businessId: fixture.offering.businessId }),
    loadProviderConnection: async () => connection,
    loadBindingByBindingId: async () => fixture.binding,
    patchBindingConnectionAuthority: async (
      _bindingId: string,
      patch: RotateCapabilityTransportBindingAuthorityPatch,
    ) => { patches.push(patch) },
  }
}

describe('capability-supply publication commands refresh', () => {
  it('rotates the exact provider-connection snapshot to the next operation', async () => {
    const fixture = await rotationFixture()
    const patches: RotateCapabilityTransportBindingAuthorityPatch[] = []
    const result = await rotateCapabilityTransportBindingAuthority(
      rotationPorts(fixture, patches),
      rotationInput(fixture),
      10,
    )
    expect(result).toEqual({
      kind: 'rotated',
      bindingId: fixture.binding.bindingId,
      previousOperationRef: fixture.previousOperationRef,
      operationRef: fixture.nextOperationRef,
    })
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({
      expectedRegistrationHash: fixture.binding.registrationHash,
      expectedAuthority: fixture.previousAuthority,
      nextAuthority: {
        connectionRef: fixture.connection.connectionRef,
        providerRef: fixture.connection.providerRef,
        adapterId: fixture.connection.adapterId,
        authorityGeneration: fixture.connection.authorityGeneration,
        authorityDigest: fixture.connection.authorityDigest,
        operationRef: fixture.nextOperationRef,
      },
      updatedAt: 10,
    })
  })

  it('refuses stale prior operation, generation, or digest without patching', async () => {
    const fixture = await rotationFixture()
    const stalePriorOperation = createPublicOperationRef({
      operationId: capabilityOperationId(fixture.binding.capabilityId),
      publicationRef: fixture.binding.offeringId,
      publicationRevision: 9,
      contractRef: {
        capabilityId: fixture.binding.capabilityId,
        version: fixture.binding.version,
        contractDigest: fixture.binding.contractDigest,
      },
    })
    const reauthorized = (overrides: Partial<ProviderConnection>): ProviderConnection => {
      const { authorityDigest: _authorityDigest, ...withoutDigest } = {
        ...fixture.connection,
        ...overrides,
      }
      return {
        ...withoutDigest,
        authorityDigest: providerConnectionAuthorityDigest(withoutDigest),
      }
    }
    const cases: Array<{
      name: string
      input: ReturnType<typeof rotationInput>
      connection: ProviderConnection
    }> = [
      {
        name: 'prior operation',
        input: { ...rotationInput(fixture), previousOperationRef: stalePriorOperation },
        connection: fixture.connection,
      },
      {
        name: 'generation',
        input: rotationInput(fixture),
        connection: reauthorized({ authorityGeneration: fixture.connection.authorityGeneration + 1 }),
      },
      {
        name: 'digest',
        input: rotationInput(fixture),
        connection: reauthorized({ grantedResources: ['resource:changed'] }),
      },
    ]
    for (const testCase of cases) {
      const patches: RotateCapabilityTransportBindingAuthorityPatch[] = []
      await expect(rotateCapabilityTransportBindingAuthority(
        rotationPorts(fixture, patches, testCase.connection),
        testCase.input,
        10,
      )).resolves.toEqual({ kind: 'refused', reason: 'connection_authority_stale' })
      expect(patches, testCase.name).toHaveLength(0)
    }
  })

  it('leaves keyless refresh unchanged without rotating authority', async () => {
    const publication = currentPublication()
    const rows = supplyRows(publication)
    const persistedBinding = await rows.loadBindingByBindingId(publication.bindingId)
    if (persistedBinding === null || persistedBinding === undefined) throw new Error('expected keyless fixture binding')
    const rotate = vi.fn()
    const encoded = encodedFor(publication.capabilityId, publication.version)
    const result = await refreshCapabilityCommand({
      publication,
      source: {
        ...publicationSource(publication.capabilityId, publication.version),
        binding: { ...bindingDraft(), authority: { kind: 'keyless' as const } },
      },
      offering: offeringDraft(),
      binding: { ...bindingDraft(), authority: { kind: 'keyless' as const } },
      ...context,
      now: 10,
    }, emptyPorts({
      ...rows,
      loadBindingByBindingId: async () => ({
        ...persistedBinding,
        authority: { kind: 'keyless' as const },
        connectionAuthority: undefined,
      }),
      getExactRegisteredContract: async () => ({
        kind: 'found',
        contract: encoded.contract,
        registeredAt: 1,
      }),
      registerContractDocument: async () => ({
        kind: 'registered',
        ref: encoded.contract.ref,
        created: false,
      }),
      rotateProviderConnectionBindingAuthority: rotate,
    }))
    expect(result).toMatchObject({ kind: 'refreshed', revision: 2 })
    expect(rotate).not.toHaveBeenCalled()
  })

  it('refuses refresh when version rules fail', async () => {
    const publication = currentPublication()
    const result = await refreshCapabilityCommand({
      publication,
      source: publicationSource('other.capability.lookup', 1),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'refresh_invalid' })
  })

  it('refuses refresh when disposition is not current', async () => {
    const result = await refreshCapabilityCommand({
      publication: currentPublication({ disposition: 'withdrawn' }),
      source: publicationSource(),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('refreshes incompatible when schemas diverge', async () => {
    const publication = currentPublication()
    const previous = encodedFor(publication.capabilityId, publication.version)
    const nextSource = {
      ...publicationSource(publication.capabilityId, publication.version + 1),
      documentJson: JSON.stringify(capabilityContractV2({
        capabilityId: publication.capabilityId,
        version: publication.version + 1,
        name: 'Demo lookup',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { request: { type: 'string', minLength: 2 } },
          required: ['request'],
          additionalProperties: false,
        },
      })),
    }
    const insertPublication = vi.fn(async () => {})
    const result = await refreshCapabilityCommand({
      publication,
      source: nextSource,
      offering: offeringDraft('next'),
      binding: bindingDraft('next'),
      ...context,
      now: 10,
    }, emptyPorts({
      getExactRegisteredContract: async () => ({
        kind: 'found',
        contract: previous.contract,
        registeredAt: 1,
      }),
      ...supplyRows(publication),
      insertPublication,
    }))
    expect(result).toMatchObject({
      kind: 'refreshed',
      disposition: 'incompatible',
      revision: 2,
    })
    expect(insertPublication).toHaveBeenCalledWith(expect.objectContaining({
      disposition: 'incompatible',
      revision: 2,
    }))
  })

  it('refreshes compatible and schedules readiness probe', async () => {
    const publication = currentPublication({
      connectionAuthority: {
        connectionRef: 'connection:demo',
        providerRef: 'provider:demo',
        adapterId: 'http-json:v1',
        authorityGeneration: 1,
        authorityDigest: digest,
        operationRef: currentPublication().operationRef,
        grantedScopes: [],
        grantedResources: [],
      },
    })
    const prepared = await preparedPublication(publication.capabilityId, publication.version)
    const encoded = encodedFor(publication.capabilityId, publication.version)
    const schedule = vi.fn(async () => {})
    const insertPublication = vi.fn(async () => {})
    const rotate = vi.fn(async (input: Parameters<NonNullable<PublicationCommandPorts['rotateProviderConnectionBindingAuthority']>>[0]) => ({
      kind: 'rotated' as const,
      bindingId: input.bindingId,
      previousOperationRef: input.previousOperationRef,
      operationRef: input.nextOperationRef,
    }))
    const result = await refreshCapabilityCommand({
      publication,
      source: publicationSource(publication.capabilityId, publication.version),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts({
      getExactRegisteredContract: async () => ({
        kind: 'found',
        contract: encoded.contract,
        registeredAt: 1,
      }),
      ...supplyRows(publication),
      scheduleReadinessProbe: schedule,
      insertPublication,
      rotateProviderConnectionBindingAuthority: rotate,
      registerContractDocument: async () => ({
        kind: 'registered',
        ref: encoded.contract.ref,
        created: false,
      }),
    }))
    expect(result).toMatchObject({
      kind: 'refreshed',
      disposition: 'current',
      revision: 2,
    })
    expect(schedule).toHaveBeenCalledWith(publication.publicationRef, 2)
    expect(rotate).toHaveBeenCalledWith(expect.objectContaining({
      bindingId: publication.bindingId,
      previousOperationRef: publication.operationRef,
    }), 10)

    const normalized = await publicationImporters.normalizeCapabilityPublication(
      publicationSource(publication.capabilityId, publication.version),
    )
    if (normalized.kind !== 'normalized') throw new Error(`refresh_fixture_refused:${normalized.reason}`)
    expect(prepared.sourceDigest).not.toBe(normalized.draft.source.descriptorDigest)
    expect(insertPublication).toHaveBeenCalledWith(expect.objectContaining({
      provenanceDigest: capabilityPublicationProvenanceDigest({
        publisherRef: publication.publisherRef,
        authorityMode: publication.authorityMode,
        sourceRevision: publication.sourceRevision,
        sourceDigest: prepared.sourceDigest,
      }),
    }))
  })
})
