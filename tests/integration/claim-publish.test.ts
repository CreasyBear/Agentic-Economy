import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  claimBusiness,
  suppressBusiness,
} from '@/modules/business/public'
import {
  getPublicBusinessCatalog,
  publishBusinessCatalog,
} from '@/modules/catalog/public'
import type { ServiceCatalogInput } from '@/modules/catalog/public'
import { emptyCatalogPublishSourceState } from '../fixtures/source-state'
import type { AdminMembership } from '@/modules/security/public'

describe('PR03 claim publish suppress flow', () => {
  it('claims without ABN, publishes idempotently, excludes raw contact, and suppresses public reads', () => {
    const state = emptyCatalogPublishSourceState()

    const anonymousClaim = claimBusiness(state, {
      actor: { kind: 'anonymous', anonymousBucket: 'ip:masked' },
      facts: claimFacts('Parramatta Emergency Plumbing', 'parramatta-emergency-plumbing'),
      security: claimSecurity('anonymous'),
      operationKey: brandNonEmpty('op:claim:anonymous-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:claim:anonymous-integration', 'CorrelationId'),
      now: 1,
    })
    expect(anonymousClaim).toMatchObject({ kind: 'error', code: 'claim_unauthenticated' })

    const claim = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_sam' },
      facts: claimFacts('Parramatta Emergency Plumbing', 'parramatta-emergency-plumbing'),
      security: claimSecurity('sam'),
      operationKey: brandNonEmpty('op:claim:sam-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:claim:sam-integration', 'CorrelationId'),
      now: 10,
    })
    expect(claim).toMatchObject({
      kind: 'ok',
      code: 'claim_created',
      business: { publicStatus: 'unpublished', trustTier: 'claimed', businessContext: { publishedPhone: '0412 345 678' } },
    })
    if (claim.kind !== 'ok') {
      throw new Error('Expected claim to succeed.')
    }

    const wrongOwnerPublish = publishBusinessCatalog(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_wrong' },
      claimId: claim.claim.claimId,
      services: validServices('sam-owner@example.test'),
      security: mutationCsrf('wrong-owner'),
      operationKey: brandNonEmpty('op:publish:wrong-owner-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:publish:wrong-owner-integration', 'CorrelationId'),
      now: 20,
    })
    expect(wrongOwnerPublish).toMatchObject({ kind: 'error', code: 'catalog_publish_wrong_owner' })

    const emptyPublish = publishBusinessCatalog(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_sam' },
      claimId: claim.claim.claimId,
      services: [],
      security: mutationCsrf('empty-services'),
      operationKey: brandNonEmpty('op:publish:empty-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:publish:empty-integration', 'CorrelationId'),
      now: 20,
    })
    expect(emptyPublish).toMatchObject({
      kind: 'error',
      code: 'catalog_publish_invalid_services',
      retryable: false,
    })

    const publishCommand = {
      actor: { kind: 'authenticated_owner' as const, clerkUserId: 'user_sam' },
      claimId: claim.claim.claimId,
      services: validServices('sam-owner@example.test'),
      security: mutationCsrf('publish'),
      operationKey: brandNonEmpty('op:publish:sam-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:publish:sam-integration', 'CorrelationId'),
      now: 20,
    }
    const published = publishBusinessCatalog(state, publishCommand)
    const replayed = publishBusinessCatalog(state, { ...publishCommand, now: 25 })

    expect(published).toMatchObject({
      kind: 'ok',
      code: 'catalog_published',
      catalog: {
        businessContext: { publishedPhone: '0412 345 678' },
        offerings: [
          {
            name: 'Emergency pipe repair',
            category: 'Emergency plumbing',
            summary: 'Burst pipe triage and repair.',
            serviceAreaSummary: 'Parramatta and nearby suburbs',
            accessPaths: [{ kind: 'human_request', channel: 'phone' }],
            support: { integrated: false, aeSupportedAction: false },
          },
        ],
      },
    })
    expect(replayed).toMatchObject({ kind: 'ok', code: 'catalog_publish_replayed' })
    expect(JSON.stringify(published)).not.toContain('sam-owner@example.test')
    expect(state.auditEvents.filter((event) => event.eventType === 'claim.published')).toHaveLength(1)
    expect(state.registryProjectionAttempts).toHaveLength(1)
    expect(state.discoveryManifestAttempts).toHaveLength(1)

    expect(
      getPublicBusinessCatalog(state, {
        slug: brandNonEmpty('parramatta-emergency-plumbing', 'Slug'),
        indexStatus: 'queued',
        discoveryStatus: 'degraded',
      })
    ).toMatchObject({ kind: 'available' })

    const suppressed = suppressBusiness(state, {
      adminMembership: ownerAdmin(),
      businessId: claim.business.businessId,
      security: mutationCsrf('suppress'),
      reasonCode: 'privacy_removal_requested',
      evidenceRefs: ['private:evidence:suppress'],
      operationKey: brandNonEmpty('op:suppress:sam-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:suppress:sam-integration', 'CorrelationId'),
      now: 30,
    })
    expect(suppressed).toMatchObject({
      kind: 'ok',
      code: 'business_suppressed',
      invalidationIntent: { surfaces: ['public_catalog', 'registry_projection', 'discovery_manifest'] },
    })
    expect(
      getPublicBusinessCatalog(state, {
        slug: brandNonEmpty('parramatta-emergency-plumbing', 'Slug'),
        indexStatus: 'queued',
        discoveryStatus: 'degraded',
      })
    ).toEqual({ kind: 'hidden', reason: 'not_published' })
    expect(state.auditEvents.filter((event) => event.eventType === 'business.suppressed')).toHaveLength(1)
    expect(state.invalidationIntents).toHaveLength(1)
  })

  it('handles CSRF, duplicate review, and unavailable first request reasons deterministically', () => {
    const state = emptyCatalogPublishSourceState()
    const missingCsrf = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_csrf' },
      facts: claimFacts('Parramatta Emergency Plumbing', 'parramatta-emergency-plumbing'),
      security: {
        csrf: { allowedOrigins: ['https://ae.example'] },
      },
      operationKey: brandNonEmpty('op:claim:missing-csrf-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:claim:missing-csrf-integration', 'CorrelationId'),
      now: 1,
    })
    expect(missingCsrf).toMatchObject({ kind: 'error', code: 'claim_csrf_rejected' })


    const first = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_original' },
      facts: claimFacts('Original Emergency Plumbing', 'original-emergency-plumbing'),
      security: claimSecurity('original'),
      operationKey: brandNonEmpty('op:claim:original-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:claim:original-integration', 'CorrelationId'),
      now: 20,
    })
    expect(first).toMatchObject({ kind: 'ok', code: 'claim_created' })

    const duplicate = claimBusiness(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_competitor' },
      facts: claimFacts(' original emergency plumbing ', 'original-emergency-plumbing-copy'),
      security: claimSecurity('competitor'),
      operationKey: brandNonEmpty('op:claim:duplicate-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:claim:duplicate-integration', 'CorrelationId'),
      now: 21,
    })
    expect(duplicate).toMatchObject({
      kind: 'error',
      code: 'claim_pending_review',
      publicReason: 'duplicate_or_impersonation_review',
      claim: { status: 'contested' },
    })
    expect(JSON.stringify(duplicate)).not.toContain('user_original')

    if (first.kind !== 'ok') {
      throw new Error('Expected first claim to succeed.')
    }

    const unavailablePublish = publishBusinessCatalog(state, {
      actor: { kind: 'authenticated_owner', clerkUserId: 'user_original' },
      claimId: first.claim.claimId,
      services: unavailableServices(),
      security: mutationCsrf('unavailable-publish'),
      operationKey: brandNonEmpty('op:publish:unavailable-integration', 'OperationKey'),
      correlationId: brandNonEmpty('corr:publish:unavailable-integration', 'CorrelationId'),
      now: 30,
    })
    expect(unavailablePublish).toMatchObject({
      kind: 'ok',
      catalog: {
        offerings: [
          {
            name: 'Emergency pipe repair',
            accessPaths: [],
            support: { integrated: false, aeSupportedAction: false },
          },
        ],
      },
    })
  })
})

function claimFacts(name: string, requestedSlug: string) {
  return {
    name,
    category: 'Emergency plumbing',
    businessContext: {
      kind: 'local_human' as const,
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      publishedPhone: '0412 345 678',
    },
    requestedSlug,
    sourceRefs: [
      {
        label: 'Owner supplied',
        evidenceRef: 'private:evidence:1',
        sourceHash: canonicalDigest(`source:${requestedSlug}`),
      },
    ],
  }
}

function validServices(rawContactValue: string): readonly ServiceCatalogInput[] {
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
        rawContactValue,
      },
    },
  ]
}

function unavailableServices(): readonly ServiceCatalogInput[] {
  return [
    {
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Burst pipe triage and repair.',
      serviceArea: 'Parramatta and nearby suburbs',
      hoursOrUnknown: 'Hours unknown',
      firstRequest: {
        mode: 'not_available_yet',
        publicChannel: 'not_available',
        noContactReason: 'Owner has not supplied public contact instructions.',
      },
    },
  ]
}

function claimSecurity(key: string) {
  return {
    csrf: mutationCsrf(key).csrf,
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


function ownerAdmin(): AdminMembership {
  return {
    clerkUserId: 'admin_1',
    tokenIdentifier: 'clerk|admin_1',
    role: 'owner_admin',
    state: 'active',
    grantedBy: 'bootstrap',
    grantedAt: 1,
  }
}
