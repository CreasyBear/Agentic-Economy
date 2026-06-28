import { describe, expect, it } from 'vitest'

import { suppressBusiness } from '@/modules/business/public'
import type { BusinessSuppressionState } from '@/modules/business/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  invalidateDiscoveryManifest,
  readDiscoveryHealth,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import type { AdminMembership } from '@/modules/security/public'

describe('discovery manifest attempts', () => {
  it('regenerates a public manifest with readback and replays duplicate source hashes', () => {
    const state = discoveryState()
    const business = firstBusiness(state)
    const first = regenerateDiscoveryManifest(
      state,
      { businessId: business.businessId },
      { now: 3_000 }
    )
    const replayed = regenerateDiscoveryManifest(
      state,
      { businessId: business.businessId },
      { now: 3_100 }
    )
    const health = readDiscoveryHealth(state, business.businessId)

    expect(first).toMatchObject({
      kind: 'ok',
      code: 'discovery_manifest_generated',
      manifest: {
        slug: 'parramatta-emergency-plumbing',
        status: 'available',
        pathKind: 'ae_hosted_fallback',
      },
      attempt: {
        status: 'succeeded',
        sourceVersion: 'public-catalog:v1',
        repairAction: 'no_repair',
        repairResult: 'succeeded',
      },
    })
    expect(replayed).toMatchObject({ kind: 'ok', code: 'discovery_manifest_replayed' })
    expect(health).toMatchObject({
      sourceState: 'published',
      discoveryStatus: 'available',
      repairAction: 'no_repair',
      repairResult: 'succeeded',
    })
    expect(state.discoveryManifests).toHaveLength(1)
    expect(state.auditEvents.filter((event) => event.eventType === 'discovery.generated')).toHaveLength(1)
  })

  it('persists redacted readback failures and retries without duplicate manifests', () => {
    const state = discoveryState()
    const business = firstBusiness(state)
    const failed = regenerateDiscoveryManifest(
      state,
      { businessId: business.businessId },
      {
        now: 3_000,
        adapter: {
          readManifest: () => ({
            kind: 'error',
            code: 'forced_discovery_readback_failure',
            redactedMessage: 'Discovery readback failed in a controlled test path.',
          }),
        },
      }
    )
    const failedHealth = readDiscoveryHealth(state, business.businessId)
    const repaired = regenerateDiscoveryManifest(
      state,
      { businessId: business.businessId },
      { now: 4_000 }
    )

    expect(failed).toMatchObject({
      kind: 'error',
      code: 'discovery_manifest_failed',
      retryable: true,
      attempt: {
        status: 'failed',
        failureCode: 'forced_discovery_readback_failure',
        failureMessageRedacted: 'Discovery readback failed in a controlled test path.',
        repairAction: 'regenerate_manifest',
        repairResult: 'failed',
      },
    })
    expect(failedHealth).toMatchObject({
      sourceState: 'published',
      discoveryStatus: 'degraded',
      repairAction: 'regenerate_manifest',
      repairResult: 'failed',
    })
    expect(repaired).toMatchObject({
      kind: 'ok',
      code: 'discovery_manifest_generated',
      attempt: {
        status: 'succeeded',
        retryCount: 1,
        repairAction: 'no_repair',
        repairResult: 'succeeded',
      },
    })
    expect(state.discoveryManifests).toHaveLength(1)
    expect(state.auditEvents.filter((event) => event.eventType === 'discovery.degraded')).toHaveLength(1)
    expect(state.auditEvents.filter((event) => event.eventType === 'discovery.generated')).toHaveLength(1)
  })

  it('invalidates manifests from suppression intents and hides suppressed catalogs from regeneration', () => {
    const state = discoveryState()
    const business = firstBusiness(state)
    const generated = regenerateDiscoveryManifest(
      state,
      { businessId: business.businessId },
      { now: 3_000 }
    )

    if (generated.kind !== 'ok') {
      throw new Error('Expected generated discovery manifest.')
    }

    const suppressed = suppressBusiness(state, {
      adminMembership: activeOwnerAdmin(),
      businessId: business.businessId,
      security: mutationCsrf('suppress'),
      reasonCode: 'owner-requested-removal',
      evidenceRefs: ['private:evidence:suppression'],
      operationKey: brandNonEmpty('op:suppress:sam-discovery', 'OperationKey'),
      correlationId: brandNonEmpty('corr:suppress:sam-discovery', 'CorrelationId'),
      now: 5_000,
    })

    if (suppressed.kind !== 'ok') {
      throw new Error(suppressed.reason)
    }

    const invalidated = invalidateDiscoveryManifest(state, {
      businessId: business.businessId,
      reasonCode: 'owner-requested-removal',
      now: 5_100,
    })
    const regenerated = regenerateDiscoveryManifest(
      state,
      { businessId: business.businessId },
      { now: 5_200 }
    )
    const health = readDiscoveryHealth(state, business.businessId)

    expect(invalidated).toMatchObject({
      kind: 'ok',
      code: 'discovery_manifest_invalidated',
      attempts: [{ status: 'stale', repairAction: 'invalidate_manifest' }],
      manifests: [{ status: 'stale', suppressedAt: 5_100 }],
    })
    expect(state.invalidationIntents).toEqual([
      expect.objectContaining({
        status: 'applied',
        surfaces: expect.arrayContaining(['discovery_manifest']),
      }),
    ])
    expect(regenerated).toMatchObject({
      kind: 'error',
      code: 'discovery_manifest_not_public',
      retryable: false,
    })
    expect(health).toMatchObject({
      sourceState: 'not_public',
      discoveryStatus: 'unavailable',
      repairAction: 'invalidate_manifest',
      repairResult: 'succeeded',
    })
  })
})

function discoveryState(): DiscoverySourceState & BusinessSuppressionState {
  return {
    ...createDefaultRegistrySourceState(),
    discoveryManifests: [],
    invalidationIntents: [],
  }
}

function firstBusiness(state: DiscoverySourceState) {
  const business = state.businesses.at(0)
  if (business === undefined) {
    throw new Error('Expected default business.')
  }

  return business
}

function activeOwnerAdmin(): AdminMembership {
  return {
    clerkUserId: 'admin_1',
    role: 'owner_admin',
    state: 'active',
    grantedBy: 'bootstrap',
    grantedAt: 1,
  }
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
