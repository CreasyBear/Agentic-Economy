import { describe, expect, it } from 'vitest'

import { claimBusiness } from '@/modules/business/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { readCatalogHealth, retryRegistryProjection, syncCatalogProjection } from '@/modules/registry/public'
import { emptyRegistryProjectionSourceState } from '../../fixtures/source-state'

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
        slug: 'parramatta-emergency-plumbing',
        schemaVersion: 'public-business-catalog-api:v2',
        offerings: [{ offeringRef: 'offering:business:parramatta-emergency-plumbing:emergency-pipe-repair' }],
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
  const claim = claimBusiness(state, {
    actor: { kind: 'authenticated_owner', clerkUserId: 'user_sam' },
    facts: {
      name: 'Parramatta Emergency Plumbing',
      category: 'Emergency plumbing',
      businessContext: {
        kind: 'local_human',
        suburb: 'Parramatta',
        stateTerritory: 'NSW',
      },
      requestedSlug: 'parramatta-emergency-plumbing',
      sourceRefs: [
        {
          label: 'Owner supplied',
          evidenceRef: 'private:evidence:sam',
          sourceHash: canonicalDigest('source:sam'),
        },
      ],
    },
    security: { csrf: mutationCsrf('claim').csrf },
    operationKey: brandNonEmpty('op:claim:sam-registry-unit', 'OperationKey'),
    correlationId: brandNonEmpty('corr:claim:sam-registry-unit', 'CorrelationId'),
    now: 1_000,
  })

  if (claim.kind === 'error') {
    throw new Error(claim.reason)
  }

  claim.business.publicStatus = 'published'
  claim.business.claimStatus = 'published'
  claim.business.updatedAt = 2_000
  claim.claim.status = 'published'
  claim.claim.updatedAt = 2_000

  const offeringRef = brandNonEmpty(
    'offering:business:parramatta-emergency-plumbing:emergency-pipe-repair',
    'OfferingRef',
  )
  const facts = {
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Burst pipe triage and repair.',
    serviceAreaSummary: 'Parramatta and nearby suburbs',
  }
  const sourceHash = canonicalDigest({ businessId: claim.business.businessId, offeringRef, revision: 1, ...facts })
  state.offerings.push({
    offeringRef,
    businessId: claim.business.businessId,
    currentRevision: 1,
    status: 'published',
    createdAt: 2_000,
    updatedAt: 2_000,
  })
  state.revisions.push({
    offeringRef,
    businessId: claim.business.businessId,
    revision: 1,
    ...facts,
    sourceHash,
    createdAt: 2_000,
  })

  return { business: claim.business }
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
