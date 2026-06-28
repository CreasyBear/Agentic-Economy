import { describe, expect, it } from 'vitest'

import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'
import type { BusinessSuppressionState } from '@/modules/business/public'
import { createEmptyCatalogSourceState, publishBusinessCatalog } from '@/modules/catalog/public'
import type { PublishBusinessCatalogState, ServiceCatalogInput } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { readCatalogHealth, retryRegistryProjection, syncCatalogProjection } from '@/modules/registry/public'
import type { RegistrySourceState } from '@/modules/registry/public'

describe('registry projection attempts', () => {
  it('syncs a published catalog DTO into durable projection items and index readback', () => {
    const state = emptyState()
    const published = publishSamCatalog(state)

    expect(state.registryProjectionAttempts).toHaveLength(2)
    expect(state.registryProjectionAttempts[0]).toMatchObject({
      status: 'queued',
      sourceVersion: 'public-catalog:v1',
      repairAction: 'rebuild_projection',
      repairResult: 'not_run',
    })

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
      catalog: { slug: 'parramatta-emergency-plumbing', indexStatus: 'indexed' },
      attempt: {
        status: 'succeeded',
        sourceVersion: 'public-catalog:v1',
        repairAction: 'no_repair',
        repairResult: 'succeeded',
      },
      projectionItems: [
        { projectionKind: 'business_catalog', publicStatus: 'published', serviceCount: 1 },
        { projectionKind: 'service_catalog', publicStatus: 'published', serviceCount: 1 },
      ],
      indexStatuses: [
        { targetType: 'business', status: 'indexed' },
        { targetType: 'service', status: 'indexed' },
      ],
    })
    expect(replayed).toMatchObject({ kind: 'ok', code: 'registry_projection_replayed' })
    expect(state.registryProjectionItems).toHaveLength(2)
    expect(state.auditEvents.filter((event) => event.eventType === 'registry.sync_succeeded')).toHaveLength(1)
    expect(JSON.stringify(synced)).not.toContain('sam-owner@example.test')
  })

  it('persists redacted forced failures and repairs without duplicate projection side effects', () => {
    const state = emptyState()
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

function emptyState(): PublishBusinessCatalogState & BusinessSuppressionState & RegistrySourceState {
  return {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
    invalidationIntents: [],
  }
}

function publishSamCatalog(state: PublishBusinessCatalogState & RegistrySourceState) {
  const claim = claimBusiness(state, {
    actor: { kind: 'authenticated_owner', clerkUserId: 'user_sam' },
    facts: {
      name: 'Parramatta Emergency Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      requestedSlug: 'parramatta-emergency-plumbing',
      sourceRefs: [
        {
          label: 'Owner supplied',
          evidenceRef: 'private:evidence:sam',
          sourceHash: brandNonEmpty('hash:source:sam', 'SourceHash'),
        },
      ],
    },
    security: {
      csrf: mutationCsrf('claim').csrf,
      rateLimit: {
        scope: 'claim_submit',
        key: 'sam',
        now: 1_000,
        limit: 5,
        windowMs: 60_000,
      },
    },
    operationKey: brandNonEmpty('op:claim:sam-registry-unit', 'OperationKey'),
    correlationId: brandNonEmpty('corr:claim:sam-registry-unit', 'CorrelationId'),
    now: 1_000,
  })

  if (claim.kind === 'error') {
    throw new Error(claim.reason)
  }

  const published = publishBusinessCatalog(state, {
    actor: { kind: 'authenticated_owner', clerkUserId: 'user_sam' },
    claimId: claim.claim.claimId,
    services: samServices(),
    security: mutationCsrf('publish'),
    operationKey: brandNonEmpty('op:publish:sam-registry-unit', 'OperationKey'),
    correlationId: brandNonEmpty('corr:publish:sam-registry-unit', 'CorrelationId'),
    now: 2_000,
  })

  if (published.kind === 'error') {
    throw new Error(published.reason)
  }

  return published
}

function samServices(): readonly ServiceCatalogInput[] {
  return [
    {
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Burst pipe triage and repair.',
      serviceArea: 'Parramatta and nearby suburbs',
      hoursOrUnknown: 'Hours supplied by owner',
      firstRequest: {
        mode: 'inquiry_available',
        publicChannel: 'public_business_contact',
        publicDisclosure: 'Use the public business contact listed on the catalog.',
        rawContactValue: 'sam-owner@example.test',
      },
    },
  ]
}

function mutationCsrf(key: string) {
  return {
    csrf: {
      csrfToken: `csrf-${key}`,
      csrfCookie: `csrf-${key}`,
      allowedOrigins: ['https://ae.example'],
    },
  }
}
