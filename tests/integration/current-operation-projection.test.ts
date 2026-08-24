import { describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { capabilityOperationId, createPublicOperationRef } from '@/modules/capability-supply/public'

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

type Fixture = Readonly<{
  publicationRef: string
  publicationRevision: number
  operationRef: string
  businessId: Id<'businesses'>
}>

async function publishFixture(
  backend: ConvexFixtureBackend,
  suffix: string,
  observe = true,
): Promise<Fixture> {
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix, '/lookup', 'POST')
  const input = capabilityPublicationInput(businessId, suffix)
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await preparedPublicationArgs(backend, {
      ...input,
      binding: { ...input.binding, authority: { kind: 'keyless' } },
    }),
  )
  if ('reason' in published) throw new Error(`t4_publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  if (observe) await observeReadiness(backend, published, 'healthy')
  return { businessId, ...published }
}

async function observeReadiness(
  backend: ConvexFixtureBackend,
  fixture: Readonly<{ publicationRef: string; publicationRevision: number }>,
  healthState: 'healthy' | 'unhealthy',
) {
  const result = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: fixture.publicationRef,
    expectedRevision: fixture.publicationRevision,
    credentialState: 'ready',
    healthState,
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:t4:readiness:${fixture.publicationRef}:${healthState}`,
    correlationId: `test:t4:${fixture.publicationRef}`,
    reasonCode: 'source_test_readiness',
    evidenceRefs: ['test:t4:readiness'],
  })
  if (result.kind !== 'observed') throw new Error(`t4_readiness_refused:${result.reason}`)
  return result
}

async function cloneCurrentPublications(
  backend: ConvexFixtureBackend,
  fixture: Fixture,
  total: number,
): Promise<string[]> {
  return await backend.run(async (ctx) => {
    const source = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
      ))
      .unique()
    if (source === null) throw new Error('t4_source_publication_missing')
    const { _id: _id, _creationTime: _creationTime, ...material } = source
    const refs = [source.operationRef]
    for (let index = 1; index < total; index += 1) {
      const publicationRef = `${source.publicationRef}:t4:${String(index).padStart(3, '0')}`
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
      await ctx.db.insert('capabilityPublications', { ...material, publicationRef, operationRef })
      refs.push(operationRef)
    }
    return refs
  })
}

async function backfillAll(backend: ConvexFixtureBackend): Promise<number> {
  let cursor: string | null = null
  let processed = 0
  for (let batch = 0; batch < 40; batch += 1) {
    const result: Readonly<{
      processed: number
      rebuilt: number
      dropped: number
      unavailable: number
      isDone: boolean
      continueCursor: string
    }> = await backend.mutation(
      internal.capabilitySupplyOperations.backfillCurrentOperationProjections,
      { paginationOpts: { numItems: 8, cursor } },
    )
    processed += result.processed
    if (result.isDone) return processed
    cursor = result.continueCursor
  }
  throw new Error('t4_backfill_did_not_finish')
}

async function setMode(
  backend: ConvexFixtureBackend,
  mode: 'old' | 'shadow' | 'new',
  reason = 'source_test',
) {
  return await backend.mutation(internal.capabilitySupplyOperations.setCurrentOperationReadMode, {
    mode,
    reason,
    releaseOwner: 't4-source-test',
    now: Date.now(),
  })
}

function percentile95(samples: readonly number[]): number {
  const ordered = [...samples].sort((left, right) => left - right)
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0
}

type DropReason =
  | 'identity_drift'
  | 'missing_offering'
  | 'missing_binding'
  | 'missing_business'
  | 'missing_contract'
  | 'business_unpublished'
  | 'invalid_transport'
  | 'malformed_price'

async function corruptProjectionSource(
  backend: ConvexFixtureBackend,
  fixture: Fixture,
  reason: DropReason,
): Promise<void> {
  await backend.run(async (ctx) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', fixture.publicationRef).eq('revision', fixture.publicationRevision)
      ))
      .unique()
    if (publication === null) throw new Error('t4_corrupt_publication_missing')
    if (reason === 'identity_drift') {
      await ctx.db.patch(publication._id, {
        operationRef: `${publication.operationRef}:drift`,
        updatedAt: publication.updatedAt + 1,
      })
      return
    }
    if (reason === 'missing_offering') {
      const row = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique()
      if (row === null) throw new Error('t4_corrupt_offering_missing')
      await ctx.db.delete(row._id)
      return
    }
    if (reason === 'missing_binding') {
      const row = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique()
      if (row === null) throw new Error('t4_corrupt_binding_missing')
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
      if (row === null) throw new Error('t4_corrupt_contract_missing')
      await ctx.db.delete(row._id)
      return
    }
    if (reason === 'business_unpublished') {
      await ctx.db.patch(publication.businessId, { publicStatus: 'unpublished' })
      return
    }
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique()
    if (binding === null) throw new Error('t4_corrupt_binding_missing')
    if (reason === 'invalid_transport') {
      await ctx.db.patch(binding._id, { configJson: '{"method":"INVALID"}' })
      return
    }
    await ctx.db.patch(publication._id, {
      pricingConfigJson: '{malformed',
      updatedAt: publication.updatedAt + 1,
    })
  })
}

describe('T4 current Operation read model', () => {
  it('defaults to old, dual-writes current/unavailable facts, and stores no endpoint or config secret', async () => {
    const backend = convexTestWithMarketComponents()
    const control = await backend.query(
      internal.capabilitySupplyOperations.readCurrentOperationReadControl,
      {},
    )
    expect(control).toEqual({
      mode: 'old',
      reason: 'projection_not_cut_over',
      releaseOwner: 'unassigned',
      updatedAt: 0,
      isDefault: true,
    })
    const fixture = await publishFixture(backend, 'projection-dual-write', false)
    const unavailable = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
    ))
    expect(unavailable).toMatchObject({ outcomeKind: 'unavailable' })
    await observeReadiness(backend, fixture, 'healthy')
    const current = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
    ))
    expect(current).toMatchObject({
      schemaVersion: 'current-operation-projection:v1',
      outcomeKind: 'current',
      active: true,
    })
    expect(current?.currentDigest).toMatch(/^sha256:/u)
    const detail = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperationDetails')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
    ))
    const durableMaterial = JSON.stringify({ current, detail })
    expect(durableMaterial).not.toContain('.example.test')
    expect(durableMaterial).not.toContain('configJson')
    expect(durableMaterial).not.toContain('endpointUrl')
    expect(durableMaterial).not.toContain('credentialRef')
  })

  it('rebuilds idempotently, shadows with zero unexplained mismatches, cuts over, and rolls back by flag', async () => {
    const backend = convexTestWithMarketComponents()
    const first = await publishFixture(backend, 'projection-parity-a')
    const second = await publishFixture(backend, 'projection-parity-b')
    const args = {
      publicationRef: first.publicationRef,
      publicationRevision: first.publicationRevision,
      now: Date.now(),
    }
    const rebuilt = await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      args,
    )
    const repeated = await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      { ...args, now: args.now + 1 },
    )
    expect(rebuilt).toMatchObject({ kind: 'rebuilt' })
    expect(repeated).toMatchObject({ kind: 'rebuilt', idempotent: true })

    const oldSearch = await backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' })
    await setMode(backend, 'shadow')
    const shadowSearch = await backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' })
    expect(shadowSearch).toEqual(oldSearch)
    await expect(backend.query(
      internal.capabilitySupplyOperations.currentOperationShadowDiagnostics,
      { now: Date.now() },
    )).resolves.toMatchObject({
      sourceCount: 2,
      projectionCount: 2,
      comparedCount: 2,
      explainedMismatchCount: 0,
      unexplainedMismatchCount: 0,
      mismatches: [],
    })

    await setMode(backend, 'new', 'local_cutover_exercise')
    const newSearch = await backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' })
    expect(newSearch).toEqual(oldSearch)
    if (newSearch.kind === 'ok') {
      for (const operationRef of [first.operationRef, second.operationRef]) {
        await expect(backend.query(api.capabilitySupplyOperations.detail, { operationRef }))
          .resolves.toMatchObject({ kind: 'found' })
      }
    }
    await setMode(backend, 'old', 'rollback_exercise')
    await expect(backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toEqual(oldSearch)
    const rowsRemain = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_active_and_operationRef', (query) => query.eq('active', true))
        .take(3)
    ))
    expect(rowsRemain).toHaveLength(2)
  })

  it('reports missing/stale/digest mismatches and requires owned expiring explanations', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishFixture(backend, 'projection-diagnostics')
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
      if (row === null) throw new Error('t4_projection_missing')
      await ctx.db.delete(row._id)
    })
    await expect(backend.query(
      internal.capabilitySupplyOperations.currentOperationShadowDiagnostics,
      { now: Date.now() },
    )).resolves.toMatchObject({
      explainedMismatchCount: 0,
      unexplainedMismatchCount: 1,
      mismatches: [{ kind: 'missing_projection', count: 1 }],
    })
    const now = Date.now()
    await backend.mutation(
      internal.capabilitySupplyOperations.recordCurrentOperationMismatchExplanation,
      {
        operationRef: fixture.operationRef,
        mismatchKind: 'missing_projection',
        owner: 't4-source-test',
        reason: 'deliberate missing-row regression fixture',
        expiresAt: now + 60_000,
        regressionFixture: 'current-operation-projection.test.ts:missing-row',
        now,
      },
    )
    await expect(backend.query(
      internal.capabilitySupplyOperations.currentOperationShadowDiagnostics,
      { now: now + 1 },
    )).resolves.toMatchObject({ explainedMismatchCount: 1, unexplainedMismatchCount: 0 })
    await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      {
        publicationRef: fixture.publicationRef,
        publicationRevision: fixture.publicationRevision,
        now: now + 2,
      },
    )
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', fixture.publicationRef)
            .eq('revision', fixture.publicationRevision)
        ))
        .unique()
      if (publication === null) throw new Error('t4_publication_missing')
      await ctx.db.patch(publication._id, { updatedAt: publication.updatedAt + 1 })
    })
    await expect(backend.query(
      internal.capabilitySupplyOperations.currentOperationShadowDiagnostics,
      { now: now + 3 },
    )).resolves.toMatchObject({
      unexplainedMismatchCount: 1,
      mismatches: [{ kind: 'stale_projection', count: 1 }],
    })
    await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      {
        publicationRef: fixture.publicationRef,
        publicationRevision: fixture.publicationRevision,
        now: now + 4,
      },
    )
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
      if (row === null) throw new Error('t4_projection_missing')
      await ctx.db.patch(row._id, { descriptorDigest: canonicalDigest({ drift: true }) })
    })
    await expect(backend.query(
      internal.capabilitySupplyOperations.currentOperationShadowDiagnostics,
      { now: now + 5 },
    )).resolves.toMatchObject({
      unexplainedMismatchCount: 1,
      mismatches: [{ kind: 'descriptor_digest', count: 1 }],
    })
  })

  it('executes both reads in shadow mode and fails new reads closed when projection coverage disappears', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishFixture(backend, 'projection-shadow-coverage')
    await setMode(backend, 'shadow', 'shadow_coverage_test')
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
      if (row === null) throw new Error('t4_projection_missing')
      await ctx.db.delete(row._id)
    })
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const shadow = await backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' })
    expect(shadow.kind).toBe('ok')
    expect(log).toHaveBeenCalledWith(
      'CURRENT_OPERATION_SHADOW',
      expect.stringContaining('"newOutcome":"unavailable"'),
    )
    log.mockRestore()
    await expect(setMode(backend, 'new', 'must_refuse_incomplete_cutover'))
      .rejects.toThrow('current_operation_cutover_not_ready')

    await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      {
        publicationRef: fixture.publicationRef,
        publicationRevision: fixture.publicationRevision,
        now: Date.now(),
      },
    )
    await setMode(backend, 'new', 'complete_cutover_test')
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
      if (row === null) throw new Error('t4_projection_missing')
      await ctx.db.delete(row._id)
    })
    await expect(backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'unavailable', reason: 'source_unavailable' })
  })

  it('completes a local probe record cycle and refreshes readiness without changing Operation identity', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishFixture(backend, 'projection-probe-cycle', false)
    const target = await backend.query(internal.capabilitySupply.readCapabilityProbeTarget, {
      publicationRef: fixture.publicationRef,
      expectedRevision: fixture.publicationRevision,
    })
    expect(target.kind).toBe('available')
    if (target.kind !== 'available') return
    const observedAt = Date.now()
    const observed = await backend.mutation(internal.capabilitySupply.recordCapabilityProbeResult, {
      publicationRef: fixture.publicationRef,
      expectedRevision: fixture.publicationRevision,
      targetDigest: target.target.targetDigest,
      requestDigest: canonicalDigest({ fixture: 't4-probe-request' } as StableHashValue),
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      observedAt,
      validUntil: observedAt + 3_600_000,
      evidenceRefs: ['test:t4:probe-cycle'],
    })
    expect(observed).toMatchObject({ kind: 'observed' })
    const row = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperationDetails')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
    ))
    expect(row).toMatchObject({ operationRef: fixture.operationRef, active: true })
    const commitment = JSON.parse(row?.commitmentJson ?? '{}') as Record<string, unknown>
    expect(commitment).toMatchObject({
      schemaVersion: 'current_operation_commitment:v1',
      operationRef: fixture.operationRef,
    })
  })

  it.each([
    'identity_drift',
    'missing_offering',
    'missing_binding',
    'missing_business',
    'missing_contract',
    'business_unpublished',
    'invalid_transport',
    'malformed_price',
  ] as const)('retains typed %s projection evidence through rebuild', async (reason) => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishFixture(backend, `projection-drop-${reason.replaceAll('_', '-')}`)
    await corruptProjectionSource(backend, fixture, reason)
    const result = await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      {
        publicationRef: fixture.publicationRef,
        publicationRevision: fixture.publicationRevision,
        now: Date.now(),
      },
    )
    expect(result).toMatchObject({ kind: 'rebuilt', outcomeKind: 'dropped' })
    const row = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_publicationRef_and_publicationRevision', (query) => (
          query.eq('publicationRef', fixture.publicationRef)
            .eq('publicationRevision', fixture.publicationRevision)
        ))
        .unique()
    ))
    expect(row).toMatchObject({ outcomeKind: 'dropped', dropReason: reason, active: true })
    await expect(backend.query(
      internal.capabilitySupplyOperations.currentOperationShadowDiagnostics,
      { now: Date.now() },
    )).resolves.toMatchObject({ unexplainedMismatchCount: 0 })
  })

  it('keeps valid Operations searchable when another current row has a typed drop outcome', async () => {
    const backend = convexTestWithMarketComponents()
    const valid = await publishFixture(backend, 'projection-valid-with-drop')
    const dropped = await publishFixture(backend, 'projection-typed-drop-with-valid')
    await corruptProjectionSource(backend, dropped, 'invalid_transport')
    await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      {
        publicationRef: dropped.publicationRef,
        publicationRevision: dropped.publicationRevision,
        now: Date.now(),
      },
    )
    const oldResult = await backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' })
    expect(oldResult).toMatchObject({
      kind: 'ok',
      matchedCount: 1,
      items: [{ operationRef: valid.operationRef }],
    })

    await setMode(backend, 'new', 'typed_drop_coverage_regression')
    await expect(backend.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toEqual(oldResult)
  })

  it.each([
    ['zero', { kind: 'fixed', amount: { currency: 'AUD', units: '0', exponent: 2 } }],
    ['range', {
      kind: 'range',
      minimum: { currency: 'AUD', units: '100', exponent: 2 },
      maximum: { currency: 'AUD', units: '900', exponent: 2 },
    }],
    ['on_request', { kind: 'on_request' }],
  ] as const)('materializes the %s price commitment without inventing execution authority', async (_label, price) => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishFixture(backend, `projection-price-${_label.replaceAll('_', '-')}`)
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', fixture.publicationRef)
            .eq('revision', fixture.publicationRevision)
        ))
        .unique()
      if (publication === null) throw new Error('t4_publication_missing')
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
        .unique()
      if (offering === null) throw new Error('t4_offering_missing')
      await ctx.db.patch(offering._id, {
        presentation: { ...offering.presentation, price },
      })
      await ctx.db.patch(publication._id, {
        pricingConfigJson: undefined,
        priceDigest: undefined,
        updatedAt: publication.updatedAt + 1,
      })
    })
    await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      {
        publicationRef: fixture.publicationRef,
        publicationRevision: fixture.publicationRevision,
        now: Date.now(),
      },
    )
    const row = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperationDetails')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
    ))
    const commitment = JSON.parse(row?.commitmentJson ?? '{}') as {
      commercial?: { price?: unknown }
    }
    expect(commitment.commercial?.price).toEqual(price)
    expect(row?.currentDigest).toMatch(/^sha256:/u)
  })

  it('retains authenticated provider authority as unavailable projection data, never executable authority', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishFixture(backend, 'projection-authenticated')
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', fixture.publicationRef)
            .eq('revision', fixture.publicationRevision)
        ))
        .unique()
      if (publication === null) throw new Error('t4_publication_missing')
      const binding = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
        .unique()
      if (binding === null) throw new Error('t4_binding_missing')
      await ctx.db.patch(binding._id, {
        authority: {
          kind: 'provider_connection',
          connectionRef: 'connection:t4-authenticated',
          providerRef: 'provider:t4-authenticated',
        },
      })
      await ctx.db.patch(publication._id, { updatedAt: publication.updatedAt + 1 })
    })
    await backend.mutation(
      internal.capabilitySupplyOperations.rebuildCurrentOperationProjection,
      {
        publicationRef: fixture.publicationRef,
        publicationRevision: fixture.publicationRevision,
        now: Date.now(),
      },
    )
    const row = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperationDetails')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
    ))
    const commitment = JSON.parse(row?.commitmentJson ?? '{}') as {
      providerAuthority?: { kind?: string; connectionRef?: string }
    }
    const searchRow = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityCurrentOperations')
        .withIndex('by_operationRef_and_active', (query) => (
          query.eq('operationRef', fixture.operationRef).eq('active', true)
        ))
        .unique()
    ))
    expect(searchRow?.outcomeKind).toBe('unavailable')
    expect(commitment.providerAuthority).toEqual({
      kind: 'provider_connection',
      connectionRef: 'connection:t4-authenticated',
      providerRef: 'provider:t4-authenticated',
    })
  })

  it.each([1, 20, 256] as const)(
    'meets the controlled %i-Operation projection query and p95 threshold',
    async (size) => {
      const backend = convexTestWithMarketComponents()
      const fixture = await publishFixture(backend, `projection-benchmark-${size}`)
      await cloneCurrentPublications(backend, fixture, size)
      expect(await backfillAll(backend)).toBe(size)
      await expect(backend.query(
        internal.capabilitySupplyOperations.currentOperationShadowDiagnostics,
        { now: Date.now() },
      )).resolves.toMatchObject({ unexplainedMismatchCount: 0 })
      await setMode(backend, 'new', `benchmark-${size}`)
      const samples: number[] = []
      const heapBytes: number[] = []
      let measurement: Awaited<ReturnType<typeof backend.query>> | undefined
      for (let run = 0; run < 10; run += 1) {
        const started = performance.now()
        measurement = await backend.query(
          internal.capabilitySupplyOperations.currentSearchBenchmark,
          { query: 'lookup', limit: 20 },
        )
        samples.push(performance.now() - started)
        heapBytes.push(process.memoryUsage().heapUsed)
      }
      const p95 = percentile95(samples)
      expect(measurement).toMatchObject({ outcome: 'ok', matchedCount: size })
      if (size === 20) {
        expect(measurement?.databaseQueries).toBeLessThan(261)
        expect(p95).toBeLessThanOrEqual(19.9837)
      }
      if (size === 256) {
        expect(measurement?.databaseQueries).toBeLessThan(3329)
        expect(p95).toBeLessThanOrEqual(215.5186)
      }
      console.info('T4_PROJECTION_BENCHMARK', JSON.stringify({
        size,
        databaseQueries: measurement?.databaseQueries,
        documentsRead: measurement?.documentsRead,
        bytesRead: measurement?.bytesRead,
        serializedResultBytes: measurement?.serializedResultBytes,
        heapHighWaterBytes: Math.max(...heapBytes),
        searchWallP95Ms: p95,
        rawSamplesMs: samples,
        samples: samples.length,
      }))
    },
    30_000,
  )

  it('keeps the typed 256/257 capacity boundary on the new read path', async () => {
    const accepted = convexTestWithMarketComponents()
    const acceptedFixture = await publishFixture(accepted, 'projection-capacity-256')
    await cloneCurrentPublications(accepted, acceptedFixture, 256)
    await backfillAll(accepted)
    await setMode(accepted, 'new')
    await expect(accepted.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.not.toMatchObject({ kind: 'unavailable', reason: 'source_capacity_exceeded' })

    const exceeded = convexTestWithMarketComponents()
    const exceededFixture = await publishFixture(exceeded, 'projection-capacity-257')
    await cloneCurrentPublications(exceeded, exceededFixture, 257)
    await backfillAll(exceeded)
    await setMode(exceeded, 'new')
    await expect(exceeded.query(api.capabilitySupplyOperations.search, { query: 'lookup' }))
      .resolves.toMatchObject({ kind: 'unavailable', reason: 'source_capacity_exceeded' })
  }, 60_000)
})
