import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules, publishedBusinessOwner, type ConvexFixtureBackend } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

const facts = {
  name: 'Catalog source-write test offering',
  category: 'testing',
  summary: 'A source-write admission regression fixture.',
}
const humanPath = {
  kind: 'human_request' as const,
  channel: 'website' as const,
  disclosure: 'Use the public website.',
}

describe('catalog owner source-write admission', () => {
  it('rejects a missing envelope across all five owner mutations without changing catalog rows', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'catalog-source-write-missing')
    const before = await catalogRows(backend)

    const results = await Promise.all([
      owner.mutation(api.catalog.createBusinessOffering, {
        businessId,
        offeringRef: 'offering:catalog-source-write-missing',
        operationKey: 'catalog-source-write-missing:create',
        correlationId: 'catalog-source-write-missing:create',
        facts,
      }),
      owner.mutation(api.catalog.reviseBusinessOffering, {
        businessId,
        offeringRef: 'offering:catalog-source-write-missing',
        operationKey: 'catalog-source-write-missing:revise',
        correlationId: 'catalog-source-write-missing:revise',
        expectedRevision: 0,
        facts,
      }),
      owner.mutation(api.catalog.changeBusinessOfferingStatus, {
        businessId,
        offeringRef: 'offering:catalog-source-write-missing',
        operationKey: 'catalog-source-write-missing:status',
        correlationId: 'catalog-source-write-missing:status',
        expectedRevision: 0,
        status: 'draft',
      }),
      owner.mutation(api.catalog.upsertOfferingAccessPath, {
        businessId,
        offeringRef: 'offering:catalog-source-write-missing',
        accessPathRef: 'access-path:catalog-source-write-missing',
        operationKey: 'catalog-source-write-missing:path',
        correlationId: 'catalog-source-write-missing:path',
        expectedRevision: 0,
        status: 'draft',
        descriptor: humanPath,
      }),
      owner.mutation(api.catalog.withdrawOfferingAccessPath, {
        businessId,
        accessPathRef: 'access-path:catalog-source-write-missing',
        operationKey: 'catalog-source-write-missing:withdraw',
        correlationId: 'catalog-source-write-missing:withdraw',
        expectedRevision: 0,
      }),
    ])

    expect(results).toEqual([
      sourceWriteRejected('missing_source_write_admission'),
      sourceWriteRejected('missing_source_write_admission'),
      sourceWriteRejected('missing_source_write_admission'),
      sourceWriteRejected('missing_source_write_admission'),
      sourceWriteRejected('missing_source_write_admission'),
    ])
    await expect(catalogRows(backend)).resolves.toEqual(before)
  })

  it('rejects a tampered envelope before changing catalog rows or consuming its nonce', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'catalog-source-write-tampered')
    const command = {
      businessId,
      offeringRef: 'offering:catalog-source-write-tampered',
      operationKey: 'catalog-source-write-tampered:create',
      correlationId: 'catalog-source-write-tampered:create',
      facts,
    }
    const admitted = await withSourceWrite('catalog_publish', command)
    const tampered = {
      ...admitted,
      sourceWrite: { ...admitted.sourceWrite, signature: `${admitted.sourceWrite.signature}tampered` },
    }
    const before = await catalogRows(backend)

    await expect(owner.mutation(api.catalog.createBusinessOffering, tampered)).resolves.toEqual(
      sourceWriteRejected('invalid_source_write_signature'),
    )
    await expect(catalogRows(backend)).resolves.toEqual(before)
    await expect(sourceWriteNonces(backend)).resolves.toEqual([])
  })
  it('fences a response-lost details replay after a newer revision and leaves later steps untouched', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'catalog-source-write-replay-fence')
    await backend.run(async (ctx) => {
      for (const key of ['offering_authoring_enabled', 'offering_public_projection_enabled'] as const) {
        await ctx.db.insert('operatorControls', {
          key,
          enabled: true,
          changedByAdminRef: 'test:catalog-source-write-replay-fence',
          reasonCode: 'catalog_source_write_replay_fence',
          evidenceRefs: ['test:catalog-source-write-replay-fence'],
          correlationId: `catalog-source-write-replay-fence:${key}`,
          operationKey: `catalog-source-write-replay-fence:${key}`,
          updatedAt: 1,
        })
      }
    })

    const offeringRef = 'offering:catalog-source-write-replay-fence'
    const baseline = await owner.mutation(api.catalog.createBusinessOffering, await withSourceWrite('catalog_publish', {
      businessId,
      offeringRef,
      operationKey: 'catalog-source-write-replay-fence:baseline',
      correlationId: 'catalog-source-write-replay-fence:baseline',
      facts,
    }))
    expect(baseline).toMatchObject({ kind: 'ok', currentRevision: 1 })

    const requestA = {
      businessId,
      offeringRef,
      operationKey: 'catalog-source-write-replay-fence:request-a:details',
      correlationId: 'catalog-source-write-replay-fence:request-a',
      expectedRevision: 1,
      facts: { ...facts, name: 'Request A details' },
    }
    await expect(owner.mutation(api.catalog.reviseBusinessOffering, await withSourceWrite('catalog_publish', requestA))).resolves.toMatchObject({
      kind: 'ok',
      currentRevision: 2,
    })

    await expect(owner.mutation(api.catalog.reviseBusinessOffering, await withSourceWrite('catalog_publish', {
      businessId,
      offeringRef,
      operationKey: 'catalog-source-write-replay-fence:request-b:details',
      correlationId: 'catalog-source-write-replay-fence:request-b',
      expectedRevision: 2,
      facts: { ...facts, name: 'Request B details' },
    }))).resolves.toMatchObject({ kind: 'ok', currentRevision: 3 })

    await expect(owner.mutation(api.catalog.changeBusinessOfferingStatus, await withSourceWrite('catalog_publish', {
      businessId,
      offeringRef,
      operationKey: 'catalog-source-write-replay-fence:request-b:status',
      correlationId: 'catalog-source-write-replay-fence:request-b',
      expectedRevision: 3,
      status: 'paused',
    }))).resolves.toMatchObject({ kind: 'ok', currentRevision: 3 })

    await expect(owner.mutation(api.catalog.reviseBusinessOffering, await withSourceWrite('catalog_publish', requestA))).resolves.toEqual({
      kind: 'error',
      code: 'revision_conflict',
      reason: 'Offering changed since the operation was committed.',
    })

    const rows = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('businessOfferings').withIndex('by_offeringRef', (query) => query.eq('offeringRef', offeringRef)).unique(),
      paths: await ctx.db.query('offeringAccessPaths').withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offeringRef)).collect(),
      operations: await ctx.db.query('operationKeys').withIndex('by_scope_key', (query) => query.eq('scope', 'catalog_offering')).collect(),
    }))
    expect(rows.offering).toMatchObject({ currentRevision: 3, status: 'paused' })
    expect(rows.paths).toEqual([])
    expect(rows.operations.map((operation) => operation.key)).toEqual([
      'catalog-source-write-replay-fence:baseline',
      'catalog-source-write-replay-fence:request-a:details',
      'catalog-source-write-replay-fence:request-b:details',
      'catalog-source-write-replay-fence:request-b:status',
    ])
    expect(rows.operations.find((operation) => operation.key === requestA.operationKey)?.resultHash).toEqual(expect.any(String))
  })

})

function sourceWriteRejected(reason: string) {
  return { kind: 'error', code: 'operation_conflict', reason }
}

async function catalogRows(backend: ConvexFixtureBackend) {
  return await backend.run(async (ctx) => ({
    offerings: await ctx.db.query('businessOfferings').collect(),
    revisions: await ctx.db.query('businessOfferingRevisions').collect(),
    accessPaths: await ctx.db.query('offeringAccessPaths').collect(),
    operationKeys: await ctx.db.query('operationKeys').collect(),
    sourceWriteNonces: await ctx.db.query('sourceWriteNonces').collect(),
  }))
}

async function sourceWriteNonces(backend: ConvexFixtureBackend) {
  return await backend.run((ctx) => ctx.db.query('sourceWriteNonces').collect())
}
