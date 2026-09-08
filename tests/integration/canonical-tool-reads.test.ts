import { describe, expect, it } from 'vitest'

import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import {
  capabilityToolId,
  createPublicToolRef,
  parsePublishedToolSnapshot,
} from '@/modules/capability-supply/public'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  convexTestWithMarketComponents,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import {
  admitPublication,
  capabilityPublicationInput,
  preparedPublicationArgs,
  seedCatalogOffering,
} from './capability-publication-harness'

type PublishedToolFixture = Readonly<{
  businessId: Id<'businesses'>
  publicationRef: string
  publicationRevision: number
  toolRef: string
  offeringId: string
  bindingId: string
  contractRef: Readonly<{
    capabilityId: string
    version: number
    contractDigest: string
  }>
}>

async function publishCurrentTool(
  backend: ConvexFixtureBackend,
  suffix: string,
): Promise<PublishedToolFixture> {
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix, '/lookup', 'POST')
  const source = capabilityPublicationInput(businessId, suffix)
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await preparedPublicationArgs(backend, {
      ...source,
      binding: {
        ...source.binding,
        authority: { kind: 'public_upstream' },
      },
    }),
  )
  if ('reason' in published) throw new Error(`canonical_publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef,
    expectedRevision: published.publicationRevision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:canonical-operation:ready:${suffix}`,
    correlationId: `test:canonical-operation:${suffix}`,
    reasonCode: 'source_test_readiness',
    evidenceRefs: ['test:canonical-operation'],
  })
  if (observed.kind !== 'observed') throw new Error(`canonical_readiness_refused:${observed.reason}`)
  return { businessId, ...published }
}

async function cloneCurrentPublications(
  backend: ConvexFixtureBackend,
  fixture: PublishedToolFixture,
  total: number,
): Promise<string[]> {
  return await backend.run(async (ctx) => {
    const source = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
      ))
      .unique()
    if (source === null) throw new Error('canonical_source_publication_missing')
    const { _id: _sourceId, _creationTime: _sourceCreationTime, ...material } = source
    const toolRefs = [source.toolRef]
    for (let index = 1; index < total; index += 1) {
      const publicationRef = `${source.publicationRef}:canonical:${String(index).padStart(3, '0')}`
      const toolRef = createPublicToolRef({
        operationId: capabilityToolId(source.capabilityId),
        publicationRef,
        publicationRevision: source.revision,
        contractRef: {
          capabilityId: source.capabilityId,
          version: source.version,
          contractDigest: source.contractDigest,
        },
      })
      await ctx.db.insert('capabilityPublications', {
        ...material,
        publicationRef,
        toolRef,
      })
      toolRefs.push(toolRef)
    }
    return toolRefs
  })
}

type CorruptionReason =
  | 'identity_drift'
  | 'missing_offering'
  | 'missing_binding'
  | 'missing_business'
  | 'missing_contract'
  | 'business_unpublished'
  | 'invalid_transport'
  | 'malformed_price'

async function corruptCurrentToolMaterial(
  backend: ConvexFixtureBackend,
  fixture: PublishedToolFixture,
  reason: CorruptionReason,
): Promise<void> {
  await backend.run(async (ctx) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
      ))
      .unique()
    if (publication === null) throw new Error('canonical_corrupt_publication_missing')
    if (reason === 'identity_drift') {
      await ctx.db.patch(publication._id, { toolRef: `${publication.toolRef}:drift` })
      return
    }
    if (reason === 'missing_offering') {
      const row = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique()
      if (row === null) throw new Error('canonical_corrupt_offering_missing')
      await ctx.db.delete(row._id)
      return
    }
    if (reason === 'missing_binding') {
      const row = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique()
      if (row === null) throw new Error('canonical_corrupt_binding_missing')
      await ctx.db.delete(row._id)
      return
    }
    if (reason === 'missing_business') {
      await ctx.db.delete(publication.businessId)
      return
    }
    if (reason === 'missing_contract') {
      const row = await ctx.db.query('capabilityContractDocuments')
        .withIndex('by_capabilityId_and_version', (query) => (
          query.eq('capabilityId', publication.capabilityId).eq('version', publication.version)
        )).unique()
      if (row === null) throw new Error('canonical_corrupt_contract_missing')
      await ctx.db.delete(row._id)
      return
    }
    if (reason === 'business_unpublished') {
      await ctx.db.patch(publication.businessId, { publicStatus: 'unpublished' })
      return
    }
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique()
    if (binding === null) throw new Error('canonical_corrupt_binding_missing')
    if (reason === 'invalid_transport') {
      await ctx.db.patch(binding._id, { configJson: '{"method":"INVALID"}' })
      return
    }
    await ctx.db.patch(publication._id, { pricingConfigJson: '{malformed' })
  })
}


describe('canonical Tool reads', () => {
  it('keeps two suppliers coherent across search, detail, compare, and pinned call identity', async () => {
    const backend = convexTestWithMarketComponents()
    const first = await publishCurrentTool(backend, 'parity-first')
    const second = await publishCurrentTool(backend, 'parity-second')
    const toolRefs = [first.toolRef, second.toolRef].sort()
    const search = await backend.query(api.capabilitySupplyTools.search, {
      query: 'lookup',
      limit: 2,
    })
    expect(search.kind).toBe('ok')
    if (search.kind !== 'ok') return
    expect(search.items.map(({ toolRef }) => toolRef).sort()).toEqual(toolRefs)
    const compare = await backend.query(api.capabilitySupplyTools.compare, { toolRefs })
    expect(compare.kind).toBe('ok')
    if (compare.kind !== 'ok') return
    for (const toolRef of toolRefs) {
      const searched = search.items.find((item) => item.toolRef === toolRef)
      const compared = compare.tools.find((item) => item.toolRef === toolRef)
      const detail = await backend.query(api.capabilitySupplyTools.detail, { toolRef })
      const pinned = await backend.query(
        internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
        { toolRef },
      )
      expect(searched).toBeDefined()
      expect(detail.kind).toBe('found')
      expect(pinned).not.toBeNull()
      if (searched === undefined || detail.kind !== 'found' || pinned === null) continue
      const snapshot = parsePublishedToolSnapshot(pinned.toolJson)
      expect(snapshot).toBeDefined()
      if (snapshot === undefined) continue
      expect(compared).toEqual(searched)
      expect(detail.tool).toEqual(searched)
      expect(createPublicToolRef({
        operationId: snapshot.operationId,
        publicationRef: snapshot.identity.publicationRef,
        publicationRevision: snapshot.identity.publicationRevision,
        contractRef: {
          capabilityId: snapshot.identity.contractId,
          version: snapshot.identity.contractVersion,
          contractDigest: snapshot.identity.contractDigest,
        },
      })).toBe(toolRef)
      expect(searched.offering.revision).toBe(snapshot.offering.origin?.kind === 'catalog_offering'
        ? snapshot.offering.origin.offeringRevision
        : 1)
      expect(searched.commercial.price).toEqual(snapshot.identity.price)
      expect(searched.commercial.priceEvidence?.priceDigest).toBe(snapshot.priceDigest)
      expect(searched.availability.observedAt).toBe(snapshot.readiness.observedAt)
      expect(searched.availability.validUntil).toBe(snapshot.readiness.validUntil)
      expect(searched.availability.lastHealthyAt).toBeTypeOf('number')
      expect(compared?.availability.lastHealthyAt).toBe(searched.availability.lastHealthyAt)
      const availabilityFact = compare.facts.find(({ field }) => field === 'availability')
      expect(availabilityFact?.values.find(({ toolRef: factToolRef }) => factToolRef === toolRef)?.lastHealthyAt)
        .toBe(searched.availability.lastHealthyAt)
      expect(searched.effects).toEqual(snapshot.contract.effects)
      expect(searched.callVia).toBe(CALL_ROUTE_CONTRACT.call.path)
    }
  })

  it.each(['price', 'readiness', 'effects'] as const)(
    'refuses the current Tool when %s changes, with no stale provider effect',
    async (material) => {
      const backend = convexTestWithMarketComponents()
      const fixture = await publishCurrentTool(backend, `stale-${material}`)
      await backend.run(async (ctx) => {
        const publication = await ctx.db.query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (query) => (
            query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
          )).unique()
        if (publication === null) throw new Error('canonical_stale_publication_missing')
        if (material === 'readiness') {
          await ctx.db.patch(publication._id, { healthState: 'unhealthy' })
          return
        }
        if (material === 'price') {
          const offering = await ctx.db.query('capabilityOfferings')
            .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique()
          if (offering === null) throw new Error('canonical_stale_offering_missing')
          await ctx.db.patch(offering._id, {
            presentation: {
              ...offering.presentation,
              price: { kind: 'fixed', amount: { currency: 'AUD', units: '1300', exponent: 2 } },
            },
          })
          return
        }
        const contract = await ctx.db.query('capabilityContractDocuments')
          .withIndex('by_capabilityId_and_version', (query) => (
            query.eq('capabilityId', publication.capabilityId).eq('version', publication.version)
          )).unique()
        if (contract === null) throw new Error('canonical_stale_contract_missing')
        const document = JSON.parse(contract.documentJson) as Record<string, unknown>
        await ctx.db.patch(contract._id, {
          documentJson: JSON.stringify({
            ...document,
            effects: [{
              effectId: 'changed-effect',
              class: 'external_state_change',
              authority: 'explicit',
              reversibility: 'reversible',
            }],
          }),
        })
      })
      await expect(backend.query(
        internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
        { toolRef: fixture.toolRef },
      )).resolves.toBeNull()
    },
  )

  it.each([
    'identity_drift',
    'missing_offering',
    'missing_binding',
    'missing_business',
    'missing_contract',
    'business_unpublished',
    'invalid_transport',
    'malformed_price',
  ] as const)('fails closed when canonical %s material is corrupt', async (reason) => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentTool(backend, `corrupt-${reason.replaceAll('_', '-')}`)
    await corruptCurrentToolMaterial(backend, fixture, reason)

    await expect(backend.query(api.capabilitySupplyTools.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'no_candidates' })
    await expect(backend.query(
      internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
      { toolRef: fixture.toolRef },
    )).resolves.toBeNull()
  })

  it('returns null instead of throwing when an offering is structurally malformed', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentTool(backend, 'malformed-offering')
    await backend.run(async (ctx) => {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', fixture.offeringId))
        .unique()
      if (offering === null) throw new Error('canonical_offering_missing')
      await ctx.db.patch(offering._id, {
        presentation: { ...offering.presentation, label: '' },
      })
    })

    await expect(backend.query(api.capabilitySupplyTools.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'no_candidates' })
    await expect(backend.query(api.capabilitySupplyTools.detail, {
      toolRef: fixture.toolRef,
    })).resolves.toMatchObject({ kind: 'not_found' })
    await expect(backend.query(api.capabilitySupplyTools.compare, {
      toolRefs: [fixture.toolRef],
    })).resolves.toMatchObject({ kind: 'unavailable', reason: 'tool_not_found' })
    await expect(backend.query(
      internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
      { toolRef: fixture.toolRef },
    )).resolves.toBeNull()
  })

  it('refuses a structurally malformed binding across every canonical reader', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentTool(backend, 'malformed-binding')
    await backend.run(async (ctx) => {
      const binding = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', fixture.bindingId))
        .unique()
      if (binding === null) throw new Error('canonical_binding_missing')
      await ctx.db.patch(binding._id, { endpointUrl: '' })
    })

    await expect(backend.query(api.capabilitySupplyTools.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'no_candidates' })
    await expect(backend.query(api.capabilitySupplyTools.detail, {
      toolRef: fixture.toolRef,
    })).resolves.toMatchObject({ kind: 'not_found' })
    await expect(backend.query(api.capabilitySupplyTools.compare, {
      toolRefs: [fixture.toolRef],
    })).resolves.toMatchObject({ kind: 'unavailable', reason: 'tool_not_found' })
    await expect(backend.query(
      internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
      { toolRef: fixture.toolRef },
    )).resolves.toBeNull()
  })

  it.each(['offering', 'binding', 'business', 'contract'] as const)(
    'continues native pagination while rechecking current joined %s facts',
    async (joinedFact) => {
      const backend = convexTestWithMarketComponents()
      const first = await publishCurrentTool(backend, `cursor-${joinedFact}-first`)
      await publishCurrentTool(backend, `cursor-${joinedFact}-second`)
      const page = await backend.query(api.capabilitySupplyTools.search, {
        query: 'lookup',
        limit: 1,
      })
      expect(page).toMatchObject({ kind: 'ok', pagination: { hasMore: true } })
      if (page.kind !== 'ok' || page.pagination.nextCursor === undefined) return

      await backend.run(async (ctx) => {
        const publication = await ctx.db.query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (query) => (
            query.eq('publicationRef', first.publicationRef).eq('revision', first.publicationRevision)
          ))
          .unique()
        if (publication === null) throw new Error('canonical_cursor_publication_missing')
        if (joinedFact === 'business') {
          const business = await ctx.db.get(publication.businessId)
          if (business === null) throw new Error('canonical_cursor_business_missing')
          await ctx.db.patch(business._id, { name: `${business.name} changed` })
          return
        }
        if (joinedFact === 'offering') {
          const offering = await ctx.db.query('capabilityOfferings')
            .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
            .unique()
          if (offering === null) throw new Error('canonical_cursor_offering_missing')
          await ctx.db.patch(offering._id, {
            presentation: { ...offering.presentation, label: `${offering.presentation.label} changed` },
          })
          return
        }
        if (joinedFact === 'binding') {
          const binding = await ctx.db.query('capabilityTransportBindings')
            .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
            .unique()
          if (binding === null) throw new Error('canonical_cursor_binding_missing')
          await ctx.db.patch(binding._id, { endpointUrl: `${binding.endpointUrl}/changed` })
          return
        }
        const contract = await ctx.db.query('capabilityContractDocuments')
          .withIndex('by_capabilityId_and_version', (query) => (
            query.eq('capabilityId', publication.capabilityId).eq('version', publication.version)
          ))
          .unique()
        if (contract === null) throw new Error('canonical_cursor_contract_missing')
        await ctx.db.patch(contract._id, { documentJson: '{malformed' })
      })

      await expect(backend.query(api.capabilitySupplyTools.search, {
        query: 'lookup',
        limit: 1,
        cursor: page.pagination.nextCursor,
      })).resolves.toMatchObject({ kind: 'ok' })
    },
  )

  it('paginates both 256 and 257 valid current Tools without a catalogue capacity refusal', async () => {
    const accepted = convexTestWithMarketComponents()
    const acceptedFixture = await publishCurrentTool(accepted, 'capacity-256')
    await cloneCurrentPublications(accepted, acceptedFixture, 256)
    await expect(accepted.query(api.capabilitySupplyTools.search, { query: 'lookup' }))
      .resolves.not.toMatchObject({ kind: 'unavailable', reason: 'source_capacity_exceeded' })

    const exceeded = convexTestWithMarketComponents()
    const exceededFixture = await publishCurrentTool(exceeded, 'capacity-257')
    await cloneCurrentPublications(exceeded, exceededFixture, 257)
    await expect(exceeded.query(api.capabilitySupplyTools.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'ok', pagination: { hasMore: true } })
  }, 30_000)

  it('omits malformed rows without refusing a large catalogue', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentTool(backend, 'capacity-mixed-258')
    await cloneCurrentPublications(backend, fixture, 258)
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
        ))
        .unique()
      if (publication === null) throw new Error('canonical_capacity_publication_missing')
      await ctx.db.patch(publication._id, {
        toolRef: `${publication.toolRef}:drift`,
        readinessValidUntil: 0,
      })
    })

    await expect(backend.query(api.capabilitySupplyTools.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'ok', pagination: { hasMore: true } })
  }, 30_000)

})
