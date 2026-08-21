import { describe, expect, it, vi } from 'vitest'

import { refreshCapabilityCommand } from '@/modules/capability-supply/internal/publication'
import { capabilityPublicationProvenanceDigest } from '@/modules/capability-supply/public'
import * as publicationImporters from '@/modules/capability-supply/internal/publication-importers'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

import {
  bindingDraft,
  context,
  currentPublication,
  emptyPorts,
  encodedFor,
  offeringDraft,
  preparedPublication,
  publicationSource,
  supplyRows,
} from './publication-commands-harness'

describe('capability-supply publication commands refresh', () => {
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
    const publication = currentPublication()
    const prepared = await preparedPublication(publication.capabilityId, publication.version)
    const encoded = encodedFor(publication.capabilityId, publication.version)
    const schedule = vi.fn(async () => {})
    const insertPublication = vi.fn(async () => {})
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
