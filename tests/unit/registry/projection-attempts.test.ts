import { describe, expect, it } from 'vitest'

import type { RegistrySourceState } from '@/modules/registry/public'
import { readCatalogHealth, retryRegistryProjection, syncCatalogProjection } from '@/modules/registry/public'
import { emptyRegistryProjectionSourceState } from '../../fixtures/source-state'
import { createLocalE2eRegistrySourceState } from '../../helpers/registry-local-e2e'

describe('registry projection attempts', () => {
  it('syncs a published catalog DTO into durable projection items and index readback', () => {
    const state = emptyRegistryProjectionSourceState()
    const published = publishSamCatalog(state)


    const synced = syncCatalogProjection(
      state,
      { businessId: published.business.businessId },
      { now: 3_000 }
    )
    const replayed = syncCatalogProjection(
      state,
      { businessId: published.business.businessId },
      { now: 3_100 }
    )

    expect(synced).toMatchObject({
      kind: 'ok',
      code: 'registry_projection_indexed',
      catalog: {
        slug: 'demo-listed-provider',
        schemaVersion: 'public-business-catalog-api:v2',
        offerings: [{ offeringRef: 'offering:demo-listed-provider:listed-offering' }],
      },
      attempt: {
        status: 'succeeded',
        sourceVersion: 'public-catalog:v1',
        repairAction: 'no_repair',
        repairResult: 'succeeded',
      },
      projectionItems: [
        { projectionKind: 'business_catalog', publicStatus: 'published', offeringCount: 1 },
        { projectionKind: 'offering_catalog', publicStatus: 'published', offeringCount: 1 },
      ],
      indexStatuses: [
        { targetType: 'business', status: 'indexed' },
        { targetType: 'offering', status: 'indexed' },
      ],
    })
    expect(replayed).toMatchObject({ kind: 'ok', code: 'registry_projection_replayed' })
    expect(state.registryProjectionItems).toHaveLength(2)
    expect(state.auditEvents.filter((event) => event.eventType === 'registry.sync_succeeded')).toHaveLength(1)
    expect(JSON.stringify(synced)).not.toContain('sam-owner@example.test')
  })

  it('persists redacted forced failures and repairs without duplicate projection side effects', () => {
    const state = emptyRegistryProjectionSourceState()
    const published = publishSamCatalog(state)

    const failed = syncCatalogProjection(
      state,
      { businessId: published.business.businessId },
      {
        now: 3_000,
        adapter: {
          writeProjection: () => ({
            kind: 'error',
            code: 'forced_projection_failure',
            redactedMessage: 'Projection adapter failed in a controlled test path.',
          }),
        },
      }
    )
    const failedHealth = readCatalogHealth(state, published.business.businessId)
    const repaired = retryRegistryProjection(
      state,
      { businessId: published.business.businessId },
      { now: 4_000 }
    )
    const repairedHealth = readCatalogHealth(state, published.business.businessId)

    expect(failed).toMatchObject({
      kind: 'error',
      code: 'registry_projection_failed',
      retryable: true,
      attempt: {
        status: 'failed',
        lastErrorCode: 'forced_projection_failure',
        lastErrorRedacted: 'Projection adapter failed in a controlled test path.',
        repairAction: 'retry_projection',
        repairResult: 'failed',
      },
    })
    expect(JSON.stringify(failed)).not.toContain('sam-owner@example.test')
    expect(failedHealth).toMatchObject({
      sourceState: 'published',
      indexStatus: 'failed',
      repairAction: 'retry_projection',
      repairResult: 'failed',
    })
    expect(repaired).toMatchObject({
      kind: 'ok',
      code: 'registry_projection_indexed',
      attempt: {
        status: 'succeeded',
        retryCount: 1,
        repairAction: 'no_repair',
        repairResult: 'succeeded',
      },
    })
    expect(repairedHealth).toMatchObject({
      sourceState: 'published',
      indexStatus: 'indexed',
      repairAction: 'no_repair',
      repairResult: 'succeeded',
    })
    expect(state.registryProjectionItems).toHaveLength(2)
    expect(state.auditEvents.filter((event) => event.eventType === 'registry.sync_failed')).toHaveLength(1)
    expect(state.auditEvents.filter((event) => event.eventType === 'registry.sync_succeeded')).toHaveLength(1)
  })
})

function publishSamCatalog(state: RegistrySourceState) {
  const fixture = createLocalE2eRegistrySourceState()
  const business = fixture.businesses.find((candidate) => candidate.slug === 'demo-listed-provider')
  if (business === undefined) throw new Error('Default registry fixture is required.')
  const context = fixture.businessContexts.find((candidate) => candidate.businessId === business.businessId)
  if (context === undefined) throw new Error('Default registry fixture is incomplete.')
  state.businesses.push(business)
  state.businessContexts.push(context)
  state.offerings.push(...fixture.offerings.filter((candidate) => candidate.businessId === business.businessId))
  state.revisions.push(...fixture.revisions.filter((candidate) => candidate.businessId === business.businessId))
  state.accessPaths.push(...fixture.accessPaths.filter((candidate) => candidate.businessId === business.businessId))
  return { business }
}
