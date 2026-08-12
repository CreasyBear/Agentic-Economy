import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import schema from '../../../convex/schema'
import { convexModules as modules } from '../../helpers/convex-fixtures'

type CuratedSeedPublication = Pick<Doc<'capabilityPublications'>, 'capabilityId' | 'publicationRef'>

describe('curated seed idempotency across source drift', () => {
  it('keeps an unchanged seed idempotent with 20 current publications', async () => {
    const backend = convexTest(schema, modules)

    const first = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    expect(first.kind).toBe('seeded')
    expect(first.sourceDrift).toEqual([])
    expect(first.publications).toHaveLength(20)

    const firstCapabilityIds = first.publications
      .map((publication: CuratedSeedPublication) => publication.capabilityId)
      .sort()
    expect(new Set(firstCapabilityIds).size).toBe(20)

    const second = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    expect(second.kind).toBe('seeded')
    expect(second.sourceDrift).toEqual([])
    expect(second.publications).toHaveLength(20)
    expect(second.publications
      .map((publication: CuratedSeedPublication) => publication.capabilityId)
      .sort()).toEqual(firstCapabilityIds)

    const currentCapabilityIds = await backend.run(async (ctx) => (
      (await ctx.db.query('capabilityPublications')
        .withIndex('by_networkId_and_disposition', (query) => (
          query.eq('networkId', 'ae:public').eq('disposition', 'current')
        ))
        .take(100))
        .map((publication) => publication.capabilityId)
        .sort()
    ))
    expect(currentCapabilityIds).toHaveLength(20)
    expect(new Set(currentCapabilityIds).size).toBe(20)
    expect(currentCapabilityIds).toEqual(firstCapabilityIds)
  })

  it('withdraws drifted source-owned supply without replacing historical rows', async () => {
    const backend = convexTest(schema, modules)

    const first = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    expect(first.publications).toHaveLength(20)

    const captured = await backend.run(async (ctx) => {
      const publication = (await ctx.db.query('capabilityPublications')
        .withIndex('by_networkId_and_disposition', (query) => (
          query.eq('networkId', 'ae:public').eq('disposition', 'current')
        ))
        .take(100))
        .find((row) => row.capabilityId === 'exa.search')
      if (publication === undefined) throw new Error('curated_drift_publication_missing')
      if (publication.publisherRef !== 'system:curated-provider-bootstrap') {
        throw new Error('curated_drift_publication_not_source_owned')
      }

      const [business, contract, offering, binding] = await Promise.all([
        ctx.db.get(publication.businessId),
        ctx.db.query('capabilityContractDocuments')
          .withIndex('by_capabilityId_and_version', (query) => (
            query.eq('capabilityId', publication.capabilityId).eq('version', publication.version)
          ))
          .unique(),
        ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
          .unique(),
        ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
          .unique(),
      ])
      if (business === null || contract === null || offering === null || binding === null) {
        throw new Error('curated_drift_referenced_row_missing')
      }

      return {
        businessSlug: business.slug,
        publisherRef: publication.publisherRef,
        publicationId: publication._id,
        publicationRef: publication.publicationRef,
        capabilityId: publication.capabilityId,
        version: publication.version,
        bindingId: publication.bindingId,
        contractRowId: contract._id,
        offeringRowId: offering._id,
        bindingRowId: binding._id,
      } as const
    })

    const bogus = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    await backend.run(async (ctx) => {
      await ctx.db.patch(captured.publicationId, { sourceDigest: bogus })
    })

    const reseeded = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    expect(reseeded.kind).toBe('source_drift_requires_migration')
    expect(reseeded.sourceDrift).toEqual([
      `${captured.businessSlug}:${captured.publicationRef}:offering_identity_conflict`,
    ])
    expect(reseeded.publications).toEqual([])

    const retained = await backend.run(async (ctx) => {
      const [publication, contract, offering, binding] = await Promise.all([
        ctx.db.get(captured.publicationId),
        ctx.db.get(captured.contractRowId),
        ctx.db.get(captured.offeringRowId),
        ctx.db.get(captured.bindingRowId),
      ])
      const currentCollisions = (await ctx.db.query('capabilityPublications')
        .withIndex('by_networkId_and_disposition', (query) => (
          query.eq('networkId', 'ae:public').eq('disposition', 'current')
        ))
        .take(1000))
        .filter((row) => (
          row.publisherRef === captured.publisherRef
          && (
            (row.capabilityId === captured.capabilityId && row.version === captured.version)
            || row.publicationRef === captured.publicationRef
            || row.bindingId === captured.bindingId
          )
        ))
      return { publication, contract, offering, binding, currentCollisions }
    })

    expect(retained.publication).not.toBeNull()
    expect(retained.publication?._id).toBe(captured.publicationId)
    expect(retained.publication?.disposition).toBe('withdrawn')
    expect(retained.publication?.sourceDigest).toBe(bogus)

    expect(retained.contract).not.toBeNull()
    expect(retained.contract?._id).toBe(captured.contractRowId)
    expect(retained.offering).not.toBeNull()
    expect(retained.offering?._id).toBe(captured.offeringRowId)
    expect(retained.binding).not.toBeNull()
    expect(retained.binding?._id).toBe(captured.bindingRowId)
    expect(retained.currentCollisions).toHaveLength(0)
  })
})