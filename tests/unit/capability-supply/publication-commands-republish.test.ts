import { describe, expect, it, vi } from 'vitest'

import {
  republishPreparedCapabilityCommand,
  type PublicationCommandPorts,
  type RepublishPreparedCapabilityCommandInput,
} from '@/modules/capability-supply/internal/publication'
import type { OperationKeyRecord } from '@/modules/capability-supply/internal/operation-ledger'

import {
  actor,
  context,
  currentPublication,
  digest,
  emptyPorts,
  encodedFor,
  publicationFixture as republishFixture,
  type PublicationFixture,
} from './publication-commands-harness'

type RepublishFixture = PublicationFixture

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
