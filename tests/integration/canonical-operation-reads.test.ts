import { describe, expect, it } from 'vitest'

import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  capabilityOperationId,
  createPublicOperationRef,
  parsePublishedOperationSnapshot,
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

type PublishedOperationFixture = Readonly<{
  businessId: Id<'businesses'>
  publicationRef: string
  publicationRevision: number
  operationRef: string
  offeringId: string
  bindingId: string
  contractRef: Readonly<{
    capabilityId: string
    version: number
    contractDigest: string
  }>
}>

async function publishCurrentOperation(
  backend: ConvexFixtureBackend,
  suffix: string,
): Promise<PublishedOperationFixture> {
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
  fixture: PublishedOperationFixture,
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
    const operationRefs = [source.operationRef]
    for (let index = 1; index < total; index += 1) {
      const publicationRef = `${source.publicationRef}:canonical:${String(index).padStart(3, '0')}`
      const operationRef = createPublicOperationRef({
        operationId: capabilityOperationId(source.capabilityId),
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
        operationRef,
      })
      operationRefs.push(operationRef)
    }
    return operationRefs
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

async function corruptCurrentOperationMaterial(
  backend: ConvexFixtureBackend,
  fixture: PublishedOperationFixture,
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
      await ctx.db.patch(publication._id, { operationRef: `${publication.operationRef}:drift` })
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


describe('canonical Operation reads', () => {
  it('keeps two suppliers coherent across search, detail, compare, inspect, and pinned call identity', async () => {
    const backend = convexTestWithMarketComponents()
    const first = await publishCurrentOperation(backend, 'parity-first')
    const second = await publishCurrentOperation(backend, 'parity-second')
    const operationRefs = [first.operationRef, second.operationRef].sort()
    const search = await backend.query(api.capabilitySupplyOperations.search, {
      query: 'lookup',
      limit: 20,
    })
    expect(search.kind).toBe('ok')
    if (search.kind !== 'ok') return
    expect(search.items.map(({ operationRef }) => operationRef).sort()).toEqual(operationRefs)
    const compare = await backend.query(api.capabilitySupplyOperations.compare, { operationRefs })
    expect(compare.kind).toBe('ok')
    if (compare.kind !== 'ok') return
    const inspect = await backend.query(api.capabilitySupplyOperations.inspectPlan, { operationRefs })
    expect(inspect).toMatchObject({ kind: 'ok', operationRefs })
    for (const operationRef of operationRefs) {
      const searched = search.items.find((item) => item.operationRef === operationRef)
      const compared = compare.operations.find((item) => item.operationRef === operationRef)
      const detail = await backend.query(api.capabilitySupplyOperations.detail, { operationRef })
      const pinned = await backend.query(
        internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
        { operationRef },
      )
      expect(searched).toBeDefined()
      expect(detail.kind).toBe('found')
      expect(pinned).not.toBeNull()
      if (searched === undefined || detail.kind !== 'found' || pinned === null) continue
      const snapshot = parsePublishedOperationSnapshot(pinned.operationJson)
      expect(snapshot).toBeDefined()
      if (snapshot === undefined) continue
      expect(compared).toEqual(searched)
      expect(detail.operation).toEqual(searched)
      expect(createPublicOperationRef({
        operationId: snapshot.operationId,
        publicationRef: snapshot.identity.publicationRef,
        publicationRevision: snapshot.identity.publicationRevision,
        contractRef: {
          capabilityId: snapshot.identity.contractId,
          version: snapshot.identity.contractVersion,
          contractDigest: snapshot.identity.contractDigest,
        },
      })).toBe(operationRef)
      expect(searched.offering.revision).toBe(snapshot.offering.origin?.kind === 'catalog_offering'
        ? snapshot.offering.origin.offeringRevision
        : 1)
      expect(searched.commercial.price).toEqual(snapshot.identity.price)
      expect(searched.commercial.priceEvidence?.priceDigest).toBe(snapshot.priceDigest)
      expect(searched.availability.observedAt).toBe(snapshot.readiness.observedAt)
      expect(searched.availability.validUntil).toBe(snapshot.readiness.validUntil)
      expect(searched.effects).toEqual(snapshot.contract.effects)
      expect(searched.callVia).toBe(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path)
    }
  })

  it.each(['price', 'readiness', 'effects'] as const)(
    'refuses execution when %s changes after inspect, with no stale provider effect',
    async (material) => {
      const backend = convexTestWithMarketComponents()
      const fixture = await publishCurrentOperation(backend, `stale-${material}`)
      await expect(backend.query(api.capabilitySupplyOperations.inspectPlan, {
        operationRefs: [fixture.operationRef],
      })).resolves.toMatchObject({ kind: 'ok', operationRefs: [fixture.operationRef] })
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
        internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
        { operationRef: fixture.operationRef },
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
    const fixture = await publishCurrentOperation(backend, `corrupt-${reason.replaceAll('_', '-')}`)
    await corruptCurrentOperationMaterial(backend, fixture, reason)

    await expect(backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'no_candidates' })
    await expect(backend.query(
      internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
      { operationRef: fixture.operationRef },
    )).resolves.toBeNull()
  })

  it('returns null instead of throwing when an offering is structurally malformed', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentOperation(backend, 'malformed-offering')
    await backend.run(async (ctx) => {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', fixture.offeringId))
        .unique()
      if (offering === null) throw new Error('canonical_offering_missing')
      await ctx.db.patch(offering._id, {
        presentation: { ...offering.presentation, label: '' },
      })
    })

    await expect(backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'no_candidates' })
    await expect(backend.query(api.capabilitySupplyOperations.detail, {
      operationRef: fixture.operationRef,
    })).resolves.toMatchObject({ kind: 'not_found' })
    await expect(backend.query(api.capabilitySupplyOperations.compare, {
      operationRefs: [fixture.operationRef],
    })).resolves.toMatchObject({ kind: 'unavailable', reason: 'operation_not_found' })
    await expect(backend.query(api.capabilitySupplyOperations.inspectPlan, {
      operationRefs: [fixture.operationRef],
    })).resolves.toMatchObject({ kind: 'unavailable', reason: 'operation_not_found' })
    await expect(backend.query(
      internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
      { operationRef: fixture.operationRef },
    )).resolves.toBeNull()
  })

  it('refuses a structurally malformed binding across every canonical reader', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentOperation(backend, 'malformed-binding')
    await backend.run(async (ctx) => {
      const binding = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', fixture.bindingId))
        .unique()
      if (binding === null) throw new Error('canonical_binding_missing')
      await ctx.db.patch(binding._id, { endpointUrl: '' })
    })

    await expect(backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'no_candidates' })
    await expect(backend.query(api.capabilitySupplyOperations.detail, {
      operationRef: fixture.operationRef,
    })).resolves.toMatchObject({ kind: 'not_found' })
    await expect(backend.query(api.capabilitySupplyOperations.compare, {
      operationRefs: [fixture.operationRef],
    })).resolves.toMatchObject({ kind: 'unavailable', reason: 'operation_not_found' })
    await expect(backend.query(api.capabilitySupplyOperations.inspectPlan, {
      operationRefs: [fixture.operationRef],
    })).resolves.toMatchObject({ kind: 'unavailable', reason: 'operation_not_found' })
    await expect(backend.query(
      internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
      { operationRef: fixture.operationRef },
    )).resolves.toBeNull()
  })

  it.each(['offering', 'binding', 'business', 'contract'] as const)(
    'invalidates a pagination cursor when joined %s facts change',
    async (joinedFact) => {
      const backend = convexTestWithMarketComponents()
      const first = await publishCurrentOperation(backend, `cursor-${joinedFact}-first`)
      await publishCurrentOperation(backend, `cursor-${joinedFact}-second`)
      const page = await backend.query(api.capabilitySupplyOperations.search, {
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

      await expect(backend.query(api.capabilitySupplyOperations.search, {
        query: 'lookup',
        limit: 1,
        cursor: page.pagination.nextCursor,
      })).resolves.toMatchObject({ kind: 'unavailable', reason: 'query_invalid' })
    },
  )

  it('accepts 256 valid current Operations and refuses 257 with the typed capacity outcome', async () => {
    const accepted = convexTestWithMarketComponents()
    const acceptedFixture = await publishCurrentOperation(accepted, 'capacity-256')
    await cloneCurrentPublications(accepted, acceptedFixture, 256)
    await expect(accepted.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.not.toMatchObject({ kind: 'unavailable', reason: 'source_capacity_exceeded' })

    const exceeded = convexTestWithMarketComponents()
    const exceededFixture = await publishCurrentOperation(exceeded, 'capacity-257')
    await cloneCurrentPublications(exceeded, exceededFixture, 257)
    await expect(exceeded.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'unavailable', reason: 'source_capacity_exceeded' })
  }, 30_000)

  it('refuses a raw overflow when one of the first 257 publications is malformed', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentOperation(backend, 'capacity-mixed-258')
    await cloneCurrentPublications(backend, fixture, 258)
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
        ))
        .unique()
      if (publication === null) throw new Error('canonical_capacity_publication_missing')
      await ctx.db.patch(publication._id, {
        operationRef: `${publication.operationRef}:drift`,
        readinessValidUntil: 0,
      })
    })

    await expect(backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'unavailable', reason: 'source_capacity_exceeded' })
  }, 30_000)

})
