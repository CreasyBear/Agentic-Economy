import { describe, expect, it, vi } from 'vitest'

import {
  admitPublicationDraft,
  republishPreparedCapabilityCommand,
  type PublicationCommandPorts,
  type PublicationCommandRow,
  type PreparedPublicationMaterial,
  type RepublishPreparedCapabilityCommandInput,
} from '@/modules/capability-supply/internal/publication'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding/registration'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import type { OperationKeyRecord } from '@/modules/capability-supply/internal/operation-ledger'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering/registration'
import { providerConnectionAuthorityDigest, type ProviderConnection } from '@/modules/capability-supply/provider-connection'
import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  capabilityPublicationProvenanceDigest,
  createPublicOperationRef,
} from '@/modules/capability-supply/public'

import {
  actor,
  context,
  currentPublication,
  digest,
  emptyPorts,
  encodedFor,
  preparedPublication,
} from './publication-commands-harness'

type RepublishFixture = Readonly<{
  prepared: PreparedPublicationMaterial
  publication: PublicationCommandRow
  offering: CapabilityOfferingRow
  binding: CapabilityBindingRow
  providerConnection: ProviderConnection
  ref: CapabilityContractRef
}>

async function republishFixture(): Promise<RepublishFixture> {
  const prepared = await preparedPublication()
  const admitted = await admitPublicationDraft({ prepared, businessId: 'business-1' })
  if ('reason' in admitted) throw new Error(`admission_fixture_refused:${admitted.reason}`)
  const ref = admitted.encoded.contract.ref
  const operationRef = createPublicOperationRef({
    operationId: capabilityOperationId(ref.capabilityId),
    publicationRef: 'offering:demo:lookup',
    publicationRevision: 1,
    contractRef: ref,
  })
  const connection = {
    connectionRef: 'connection:demo',
    businessId: 'business-1',
    providerRef: 'provider:demo',
    providerAccountRef: 'account:demo',
    adapterId: admitted.binding.adapter.adapterId,
    credentialRef: null,
    grantedScopes: [],
    grantedResources: [],
    authorityGeneration: 1,
    authorityDigest: '',
    lifecycle: 'active' as const,
    observedAt: 1,
    evidenceRefs: ['evidence:provider-connection'],
    createdAt: 1,
    updatedAt: 1,
    lastCommandId: 'command:demo',
    lastCommandDigest: digest,
  }
  const providerConnection = {
    ...connection,
    authorityDigest: providerConnectionAuthorityDigest(connection),
  }
  const connectionAuthority = {
    connectionRef: connection.connectionRef,
    providerRef: connection.providerRef,
    adapterId: connection.adapterId,
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: providerConnection.authorityDigest,
    operationRef,
    grantedScopes: [],
    grantedResources: [],
  }
  const publication = currentPublication({
    operationRef,
    disposition: 'withdrawn',
    sourceKind: prepared.sourceKind,
    sourceSelector: prepared.sourceSelector,
    sourceDescriptorJson: prepared.sourceDescriptorJson,
    sourceRevision: prepared.sourceRevision,
    sourceDigest: prepared.sourceDigest,
    pricingConfigJson: prepared.pricingConfigJson,
    priceDigest: prepared.priceDigest,
    contractDigest: ref.contractDigest,
    provenanceDigest: capabilityPublicationProvenanceDigest({
      publisherRef: 'owner-1',
      authorityMode: 'provider_owned',
      sourceRevision: prepared.sourceRevision,
      sourceDigest: prepared.sourceDigest,
    }),
    connectionAuthority,
    readinessOutcome: 'healthy',
    readinessObservedAt: 100,
    readinessValidUntil: 200,
  })
  const offering: CapabilityOfferingRow = {
    offeringId: admitted.offering.offeringId,
    businessId: publication.businessId,
    networkId: admitted.offering.networkId,
    capabilityId: ref.capabilityId,
    version: ref.version,
    contractDigest: ref.contractDigest,
    presentation: admitted.offering.presentation,
    searchTerms: admitted.offering.searchTerms,
    registrationEvidenceRefs: admitted.offering.registrationEvidenceRefs,
    registrationHash: capabilityOfferingRegistrationHash(admitted.offering),
    status: 'active',
    admissionEvidenceRefs: ['evidence:admission'],
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
    capabilityId: ref.capabilityId,
    version: ref.version,
    contractDigest: ref.contractDigest,
    endpointUrl: admitted.binding.endpointUrl,
    authority: admitted.binding.authority,
    connectionAuthority,
    continuation: admitted.binding.continuation,
    cancellation: admitted.binding.cancellation,
    adapterId: admitted.binding.adapter.adapterId,
    configJson: admitted.admittedTransport.transport.configJson,
    configDigest: admitted.admittedTransport.transport.configDigest,
    registrationEvidenceRefs: admitted.binding.registrationEvidenceRefs,
    registrationHash: capabilityBindingRegistrationHash(admitted.binding, admitted.admittedTransport.transport),
    admission: 'admitted',
    conformance: 'conformant',
    admissionEvidenceRefs: ['evidence:admission'],
    conformanceEvidenceRefs: ['evidence:conformance'],
    eligibilityHash: digest,
    registeredAt: 1,
    updatedAt: 1,
  }
  return { prepared, publication, offering, binding, providerConnection, ref }
}

function republishPorts(
  fixture: RepublishFixture,
  overrides: Partial<PublicationCommandPorts> = {},
): PublicationCommandPorts {
  return emptyPorts({
    findContractDigest: async () => fixture.ref.contractDigest,
    getExactRegisteredContract: async () => ({
      kind: 'found',
      contract: encodedFor().contract,
      registeredAt: 1,
    }),
    loadPublicationAtRevision: async (_publicationRef, revision) => (
      revision === fixture.publication.revision ? fixture.publication : null
    ),
    loadOfferingByOfferingId: async () => fixture.offering,
    loadBindingByBindingId: async (bindingId) => (
      bindingId === fixture.binding.bindingId ? fixture.binding : null
    ),
    loadProviderConnection: async () => fixture.providerConnection,
    registerOffering: async () => ({
      kind: 'registered',
      offeringId: fixture.offering.offeringId,
      registrationHash: fixture.offering.registrationHash,
      created: false,
    }),
    registerBinding: async () => ({
      kind: 'registered',
      bindingId: fixture.binding.bindingId,
      registrationHash: fixture.binding.registrationHash,
      created: true,
    }),
    ...overrides,
  })
}

function republishInput(
  fixture: RepublishFixture,
  overrides: Partial<RepublishPreparedCapabilityCommandInput> = {},
): RepublishPreparedCapabilityCommandInput {
  return {
    businessId: fixture.publication.businessId,
    publication: fixture.publication,
    prepared: fixture.prepared,
    actor,
    ...context,
    now: 10,
    ...overrides,
  }
}

describe('capability-supply publication commands republish', () => {
  it('refuses republish for a foreign owner before reading effects', async () => {
    const fixture = await republishFixture()
    const result = await republishPreparedCapabilityCommand(republishInput(fixture, {
      actor: { kind: 'owner', ref: 'owner-2' },
    }), republishPorts(fixture))
    expect(result).toEqual({ kind: 'refused', reason: 'authorization_denied' })
  })

  it('refuses republish when the withdrawn revision is no longer current', async () => {
    const fixture = await republishFixture()
    const result = await republishPreparedCapabilityCommand(republishInput(fixture, {
      publication: { ...fixture.publication, revision: 2 },
    }), republishPorts(fixture))
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('refuses republish of a non-withdrawn publication', async () => {
    const fixture = await republishFixture()
    const result = await republishPreparedCapabilityCommand(republishInput(fixture, {
      publication: { ...fixture.publication, disposition: 'current' },
    }), republishPorts(fixture))
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('refuses republish when persisted source or pricing material drifts', async () => {
    const fixture = await republishFixture()
    const sourceResult = await republishPreparedCapabilityCommand(republishInput(fixture, {
      prepared: { ...fixture.prepared, sourceDescriptorJson: `${fixture.prepared.sourceDescriptorJson} ` },
    }), republishPorts(fixture))
    expect(sourceResult).toEqual({ kind: 'refused', reason: 'source_invalid' })

    const pricingResult = await republishPreparedCapabilityCommand(republishInput(fixture, {
      prepared: { ...fixture.prepared, priceDigest: `sha256:${'b'.repeat(64)}` },
    }), republishPorts(fixture))
    expect(pricingResult).toEqual({ kind: 'refused', reason: 'pricing_config_invalid' })
  })

  it('refuses republish when authority snapshot no longer matches', async () => {
    const fixture = await republishFixture()
    const { connectionAuthority: _connectionAuthority, ...tampered } = fixture.publication
    const result = await republishPreparedCapabilityCommand(republishInput(fixture, {
      publication: tampered,
    }), republishPorts(fixture, {
      loadPublicationAtRevision: async (_publicationRef, revision) => revision === 1 ? tampered : null,
    }))
    expect(result).toEqual({ kind: 'refused', reason: 'connection_authority_stale' })
  })

  it('refuses republish when the next revision already exists or its operation key conflicts', async () => {
    const fixture = await republishFixture()
    const next = currentPublication({ revision: 2, disposition: 'current' })
    const nextResult = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      loadPublicationAtRevision: async (_publicationRef, revision) => revision === 1 ? fixture.publication : next,
    }))
    expect(nextResult).toEqual({ kind: 'refused', reason: 'revision_changed' })

    const conflictResult = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      findOperationKey: async () => ({
        operationId: 'operation:conflict',
        requestHash: digest,
        status: 'in_progress',
        effectRefs: [],
      }),
    }))
    expect(conflictResult).toEqual({ kind: 'refused', reason: 'operation_key_conflict' })
  })

  it('republishes as revision plus one with a fresh binding and readiness', async () => {
    const fixture = await republishFixture()
    const insertPublication = vi.fn(async () => {})
    const scheduleReadiness = vi.fn(async () => {})
    const registerBinding = vi.fn(async () => ({
      kind: 'registered' as const,
      bindingId: fixture.binding.bindingId,
      registrationHash: fixture.binding.registrationHash,
      created: true,
    }))
    const result = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      insertPublication,
      scheduleReadinessProbe: scheduleReadiness,
      registerBinding,
    }))
    expect(result).toMatchObject({
      kind: 'published',
      publicationRef: fixture.publication.publicationRef,
      publicationRevision: 2,
      bindingId: `${fixture.binding.bindingId}:revision:2`,
      lifecycle: { state: 'inactive' },
    })
    expect(insertPublication).toHaveBeenCalledWith(expect.objectContaining({
      publicationRef: fixture.publication.publicationRef,
      revision: 2,
      disposition: 'current',
      supersedesRevision: 1,
      bindingId: `${fixture.binding.bindingId}:revision:2`,
    }))
    if ('reason' in result) throw new Error(`republish_fixture_refused:${result.reason}`)
    expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({
      bindingId: `${fixture.binding.bindingId}:revision:2`,
    }), 10, result.operationRef)
    expect(scheduleReadiness).toHaveBeenCalledWith(fixture.publication.publicationRef, 2)
    expect(fixture.publication.disposition).toBe('withdrawn')
  })

  it('replays republish without registering or inserting a second revision', async () => {
    const fixture = await republishFixture()
    let operation: OperationKeyRecord | null = null
    const first = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      insertOperationKey: async ({ requestHash }) => {
        operation = {
          operationId: 'operation:republish',
          requestHash,
          status: 'in_progress',
          effectRefs: [],
        }
        return 'operation:republish'
      },
      markOperationSucceeded: async (_operationId, resultHash, effectRefs) => {
        if (operation === null) throw new Error('missing_operation_fixture')
        operation = { ...operation, resultHash, effectRefs, status: 'succeeded' }
      },
    }))
    expect(first.kind).toBe('published')
    if (operation === null) throw new Error('missing_operation_fixture')
    const registerContract = vi.fn(async () => {
      throw new Error('replay_must_not_register')
    })
    const replay = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      findOperationKey: async () => operation,
      registerContractDocument: registerContract,
    }))
    expect(replay).toMatchObject({
      kind: 'replayed',
      publicationRevision: 2,
      bindingId: `${fixture.binding.bindingId}:revision:2`,
    })
    expect(registerContract).not.toHaveBeenCalled()
  })
})
