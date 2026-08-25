import { describe, expect, it, vi } from 'vitest'

import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
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
        authority: { kind: 'keyless' },
      },
    }),
  )
  if ('reason' in published) throw new Error(`wave0_publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef,
    expectedRevision: published.publicationRevision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:wave0:ready:${suffix}`,
    correlationId: `test:wave0:${suffix}`,
    reasonCode: 'source_test_readiness',
    evidenceRefs: ['test:wave0'],
  })
  if (observed.kind !== 'observed') throw new Error(`wave0_readiness_refused:${observed.reason}`)
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
    if (source === null) throw new Error('wave0_source_publication_missing')
    const { _id: _sourceId, _creationTime: _sourceCreationTime, ...material } = source
    const operationRefs = [source.operationRef]
    for (let index = 1; index < total; index += 1) {
      const publicationRef = `${source.publicationRef}:wave0:${String(index).padStart(3, '0')}`
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

async function projectionDiagnostics(backend: ConvexFixtureBackend) {
  return await backend.query(internal.capabilitySupplyOperations.currentProjectionDiagnostics, {
    now: Date.now(),
  })
}

type DropReason = Awaited<ReturnType<typeof projectionDiagnostics>>['drops'][number]['reason']

async function corruptCurrentProjection(
  backend: ConvexFixtureBackend,
  fixture: PublishedOperationFixture,
  reason: DropReason,
): Promise<void> {
  await backend.run(async (ctx) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
      ))
      .unique()
    if (publication === null) throw new Error('wave0_corrupt_publication_missing')
    if (reason === 'identity_drift') {
      await ctx.db.patch(publication._id, { operationRef: `${publication.operationRef}:drift` })
      return
    }
    if (reason === 'missing_offering') {
      const row = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique()
      if (row === null) throw new Error('wave0_corrupt_offering_missing')
      await ctx.db.delete(row._id)
      return
    }
    if (reason === 'missing_binding') {
      const row = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique()
      if (row === null) throw new Error('wave0_corrupt_binding_missing')
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
      if (row === null) throw new Error('wave0_corrupt_contract_missing')
      await ctx.db.delete(row._id)
      return
    }
    if (reason === 'business_unpublished') {
      await ctx.db.patch(publication.businessId, { publicStatus: 'unpublished' })
      return
    }
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique()
    if (binding === null) throw new Error('wave0_corrupt_binding_missing')
    if (reason === 'invalid_transport') {
      await ctx.db.patch(binding._id, { configJson: '{"method":"INVALID"}' })
      return
    }
    await ctx.db.patch(publication._id, { pricingConfigJson: '{malformed' })
  })
}

function percentile95(samples: readonly number[]): number {
  const ordered = [...samples].sort((left, right) => left - right)
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0
}

function keylessSource(backend: ConvexFixtureBackend): KeylessExecutableSourcePort {
  return {
    list: async () => [],
    search: async () => [],
    read: async (operationRef) => {
      const row = await backend.query(api.capabilitySupplyOperations.readKeylessExecutable, { operationRef })
      if (row === null) return null
      return {
        ...row,
        inputSchema: JSON.parse(row.inputSchemaJson) as Record<string, unknown>,
        ...(row.outputSchemaJson === undefined
          ? {}
          : { outputSchema: JSON.parse(row.outputSchemaJson) as Record<string, unknown> }),
      }
    },
  }
}

describe('Wave 0 current Operation verification', () => {
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
        if (publication === null) throw new Error('wave0_stale_publication_missing')
        if (material === 'readiness') {
          await ctx.db.patch(publication._id, { healthState: 'unhealthy' })
          return
        }
        if (material === 'price') {
          const offering = await ctx.db.query('capabilityOfferings')
            .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique()
          if (offering === null) throw new Error('wave0_stale_offering_missing')
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
        if (contract === null) throw new Error('wave0_stale_contract_missing')
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
      const providerFetch = vi.fn()
      await expect(executeKeylessOperation(
        { operationRef: fixture.operationRef, input: { request: 'must-reinspect' } },
        keylessSource(backend),
        { fetchImpl: providerFetch, isPublicTarget: async () => true },
      )).resolves.toEqual({
        kind: 'refused',
        operationRef: fixture.operationRef,
        reason: 'operation_not_found',
      })
      expect(providerFetch).not.toHaveBeenCalled()
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
  ] as const)('reports bounded %s evidence instead of a silent projection drop', async (reason) => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentOperation(backend, `drop-${reason.replaceAll('_', '-')}`)
    await corruptCurrentProjection(backend, fixture, reason)

    const search = await backend.query(api.capabilitySupplyOperations.search, {
      query: 'private-query-sentinel',
    })
    expect(search.kind).toBe('no_candidates')
    const diagnostic = await projectionDiagnostics(backend)
    expect(diagnostic).toMatchObject({
      scannedCount: 1,
      projectedCount: 0,
      unavailableCount: 0,
      dropCount: 1,
      truncated: false,
      drops: [{ reason, count: 1 }],
    })
    expect(JSON.stringify(diagnostic)).not.toContain('private-query-sentinel')
    expect(JSON.stringify(diagnostic)).not.toContain('.example.test')
  })

  it('distinguishes a legitimate unavailable state from corrupt projection material', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentOperation(backend, 'unavailable-health')
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
        )).unique()
      if (publication === null) throw new Error('wave0_unavailable_publication_missing')
      await ctx.db.patch(publication._id, { healthState: 'unhealthy' })
    })
    await expect(projectionDiagnostics(backend)).resolves.toMatchObject({
      scannedCount: 1,
      projectedCount: 1,
      unavailableCount: 1,
      dropCount: 0,
      drops: [],
      unavailable: [{ reason: 'temporarily_unavailable', count: 1 }],
    })
  })

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

  it.each([1, 20, 256] as const)('records the reproducible %i-Operation search baseline', async (size) => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishCurrentOperation(backend, `benchmark-${size}`)
    const operationRefs = await cloneCurrentPublications(backend, fixture, size)
    const wallMs: number[] = []
    const heapBytes: number[] = []
    let measurement: Awaited<ReturnType<typeof backend.query>> | undefined
    for (let run = 0; run < 10; run += 1) {
      const started = performance.now()
      measurement = await backend.query(internal.capabilitySupplyOperations.currentSearchBenchmark, {
        query: 'lookup',
        limit: 20,
      })
      wallMs.push(performance.now() - started)
      heapBytes.push(process.memoryUsage().heapUsed)
    }
    const detailStarted = performance.now()
    const detail = await backend.query(api.capabilitySupplyOperations.detail, {
      operationRef: operationRefs[0]!,
    })
    const detailMs = performance.now() - detailStarted
    const compareStarted = performance.now()
    const compare = await backend.query(api.capabilitySupplyOperations.compare, {
      operationRefs: operationRefs.slice(0, Math.min(2, operationRefs.length)),
    })
    const compareMs = performance.now() - compareStarted
    const inspectStarted = performance.now()
    const inspect = await backend.query(api.capabilitySupplyOperations.inspectPlan, {
      operationRefs: operationRefs.slice(0, Math.min(2, operationRefs.length)),
    })
    const inspectMs = performance.now() - inspectStarted
    expect(measurement).toMatchObject({ outcome: 'ok', matchedCount: size })
    expect(detail.kind).toBe('found')
    expect(compare.kind).toBe('ok')
    expect(inspect.kind).toBe('ok')
    console.info('T1_WAVE0_BASELINE', JSON.stringify({
      size,
      sourceRows: size,
      databaseQueries: measurement?.databaseQueries,
      documentsRead: measurement?.documentsRead,
      bytesRead: measurement?.bytesRead,
      serializedResultBytes: measurement?.serializedResultBytes,
      heapHighWaterBytes: Math.max(...heapBytes),
      searchWallP95Ms: percentile95(wallMs),
      detailMs,
      compareMs,
      inspectMs,
      samples: wallMs.length,
    }))
  }, 30_000)
})
