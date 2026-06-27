import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { claimBusiness, createEmptyBusinessSourceState, suppressBusiness } from '@/modules/business/public'
import type { BusinessSuppressionState } from '@/modules/business/public'
import {
  createEmptyCatalogSourceState,
  getPublicBusinessCatalog,
  publishBusinessCatalog,
} from '@/modules/catalog/public'
import type { PublishBusinessCatalogState, ServiceCatalogInput } from '@/modules/catalog/public'
import type { AdminMembership } from '@/modules/security/public'

describe('suppressBusiness', () => {
  it('hides public catalog reads and records audit plus invalidation intent idempotently', () => {
    const state = publishedState()
    const businessId = firstBusinessId(state)

    expect(
      getPublicBusinessCatalog(state, {
        slug: brandNonEmpty('parramatta-emergency-plumbing', 'Slug'),
        indexStatus: 'queued',
        discoveryStatus: 'degraded',
      })
    ).toMatchObject({ kind: 'available' })

    const first = suppressBusiness(state, {
      adminMembership: ownerAdmin(),
      businessId,
      security: csrf('suppress'),
      reasonCode: 'privacy_removal_requested',
      evidenceRefs: ['private:evidence:suppress'],
      operationKey: brandNonEmpty('op:suppress:business', 'OperationKey'),
      correlationId: brandNonEmpty('corr:suppress:business', 'CorrelationId'),
      now: 30,
    })
    const replay = suppressBusiness(state, {
      adminMembership: ownerAdmin(),
      businessId,
      security: csrf('suppress'),
      reasonCode: 'privacy_removal_requested',
      evidenceRefs: ['private:evidence:suppress'],
      operationKey: brandNonEmpty('op:suppress:business', 'OperationKey'),
      correlationId: brandNonEmpty('corr:suppress:business', 'CorrelationId'),
      now: 40,
    })

    expect(first).toMatchObject({
      kind: 'ok',
      code: 'business_suppressed',
      business: { publicStatus: 'suppressed', claimStatus: 'suppressed' },
      invalidationIntent: {
        surfaces: ['public_catalog', 'registry_projection', 'discovery_manifest'],
        status: 'queued',
      },
    })
    expect(replay).toMatchObject({ kind: 'ok', code: 'business_suppression_replayed' })
    expect(state.businessServices).toMatchObject([{ status: 'suppressed' }])
    expect(state.auditEvents.filter((event) => event.eventType === 'business.suppressed')).toHaveLength(1)
    expect(state.invalidationIntents).toHaveLength(1)
    expect(
      getPublicBusinessCatalog(state, {
        slug: brandNonEmpty('parramatta-emergency-plumbing', 'Slug'),
        indexStatus: 'queued',
        discoveryStatus: 'degraded',
      })
    ).toEqual({ kind: 'hidden', reason: 'not_published' })
  })

  it('denies non-owner-admin suppression attempts', () => {
    const state = publishedState()

    expect(
      suppressBusiness(state, {
        adminMembership: { ...ownerAdmin(), role: 'support' },
        businessId: firstBusinessId(state),
        security: csrf('support'),
        reasonCode: 'privacy_removal_requested',
        evidenceRefs: ['private:evidence:suppress'],
        operationKey: brandNonEmpty('op:suppress:support', 'OperationKey'),
        correlationId: brandNonEmpty('corr:suppress:support', 'CorrelationId'),
        now: 30,
      })
    ).toMatchObject({ kind: 'error', code: 'business_suppress_admin_denied' })
  })
})

function publishedState(): PublishBusinessCatalogState & BusinessSuppressionState {
  const state: PublishBusinessCatalogState & BusinessSuppressionState = {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    suppressionRules: [],
    invalidationIntents: [],
  }

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
          evidenceRef: 'private:evidence:1',
          sourceHash: brandNonEmpty('hash:source:1', 'SourceHash'),
        },
      ],
    },
    security: {
      csrf: {
        csrfToken: 'csrf-claim',
        csrfCookie: 'csrf-claim',
        allowedOrigins: ['https://ae.example'],
      },
      rateLimit: {
        scope: 'claim_submit',
        key: 'claim-suppress-fixture',
        now: 1_000,
        limit: 5,
        windowMs: 60_000,
      },
    },
    operationKey: brandNonEmpty('op:claim:suppress-fixture', 'OperationKey'),
    correlationId: brandNonEmpty('corr:claim:suppress-fixture', 'CorrelationId'),
    now: 10,
  })

  if (claim.kind !== 'ok') {
    throw new Error('Expected claim fixture to be valid.')
  }

  const publish = publishBusinessCatalog(state, {
    actor: { kind: 'authenticated_owner', clerkUserId: 'user_sam' },
    claimId: claim.claim.claimId,
    services: validServices(),
    security: csrf('publish'),
    operationKey: brandNonEmpty('op:publish:suppress-fixture', 'OperationKey'),
    correlationId: brandNonEmpty('corr:publish:suppress-fixture', 'CorrelationId'),
    now: 20,
  })

  if (publish.kind !== 'ok') {
    throw new Error('Expected publish fixture to be valid.')
  }

  return state
}

function firstBusinessId(state: BusinessSuppressionState) {
  const business = state.businesses.at(0)
  if (business === undefined) {
    throw new Error('Expected published state to include a business.')
  }

  return business.businessId
}

function ownerAdmin(): AdminMembership {
  return {
    clerkUserId: 'admin_1',
    role: 'owner_admin',
    state: 'active',
    grantedBy: 'bootstrap',
    grantedAt: 1,
  }
}

function csrf(key: string) {
  return {
    csrf: {
      csrfToken: `csrf-${key}`,
      csrfCookie: `csrf-${key}`,
      allowedOrigins: ['https://ae.example'],
    },
  }
}

function validServices(): readonly ServiceCatalogInput[] {
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
      },
    },
  ]
}
