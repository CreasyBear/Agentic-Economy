import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'
import {
  createEmptyCatalogSourceState,
  publishBusinessCatalog,
} from '@/modules/catalog/public'
import type {
  PublishBusinessCatalogState,
  ServiceCatalogInput,
} from '@/modules/catalog/public'

describe('publishBusinessCatalog', () => {
  it('rejects anonymous, wrong-owner, and empty-service publish attempts', () => {
    const state = claimedState()
    const claim = firstClaimId(state)

    expect(
      publishBusinessCatalog(state, {
        actor: { kind: 'anonymous', anonymousBucket: 'ip:masked' },
        claimId: claim,
        services: validServices(),
        security: validSecurity('anon'),
        operationKey: brandNonEmpty('op:publish:anon', 'OperationKey'),
        correlationId: brandNonEmpty('corr:publish:anon', 'CorrelationId'),
        now: 20,
      })
    ).toMatchObject({ kind: 'error', code: 'catalog_publish_unauthenticated' })

    expect(
      publishBusinessCatalog(state, {
        actor: { kind: 'authenticated_owner', clerkUserId: 'user_wrong' },
        claimId: claim,
        services: validServices(),
        security: validSecurity('wrong'),
        operationKey: brandNonEmpty('op:publish:wrong', 'OperationKey'),
        correlationId: brandNonEmpty('corr:publish:wrong', 'CorrelationId'),
        now: 20,
      })
    ).toMatchObject({ kind: 'error', code: 'catalog_publish_wrong_owner' })

    expect(
      publishBusinessCatalog(state, {
        actor: { kind: 'authenticated_owner', clerkUserId: 'user_sam' },
        claimId: claim,
        services: [],
        security: validSecurity('empty'),
        operationKey: brandNonEmpty('op:publish:empty', 'OperationKey'),
        correlationId: brandNonEmpty('corr:publish:empty', 'CorrelationId'),
        now: 20,
      })
    ).toMatchObject({ kind: 'error', code: 'catalog_publish_invalid_services' })
  })

  it('publishes once and replays repeated publish without duplicate side effects', () => {
    const state = claimedState()
    const claim = firstClaimId(state)
    const command = {
      actor: { kind: 'authenticated_owner' as const, clerkUserId: 'user_sam' },
      claimId: claim,
      services: validServices(),
      security: validSecurity('publish'),
      operationKey: brandNonEmpty('op:publish:sam', 'OperationKey'),
      correlationId: brandNonEmpty('corr:publish:sam', 'CorrelationId'),
      now: 20,
    }

    const first = publishBusinessCatalog(state, command)
    const second = publishBusinessCatalog(state, { ...command, now: 30 })

    expect(first).toMatchObject({
      kind: 'ok',
      code: 'catalog_published',
      business: { publicStatus: 'published', claimStatus: 'published' },
      claim: { status: 'published' },
      catalog: {
        services: [
          {
            firstRequest: { rawContactExcluded: true },
            capabilities: [{ callable: false, paymentRequired: false }],
          },
        ],
      },
    })
    expect(second).toMatchObject({ kind: 'ok', code: 'catalog_publish_replayed' })
    expect(state.auditEvents).toHaveLength(1)
    expect(state.registryProjectionAttempts).toHaveLength(2)
    expect(state.discoveryManifestAttempts).toHaveLength(1)
    expect(state.operationKeys).toHaveLength(1)
  })
})

function claimedState(): PublishBusinessCatalogState {
  const state: PublishBusinessCatalogState = {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
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
    security: validSecurity('claim'),
    operationKey: brandNonEmpty('op:claim:sam-publish', 'OperationKey'),
    correlationId: brandNonEmpty('corr:claim:sam-publish', 'CorrelationId'),
    now: 10,
  })

  if (claim.kind !== 'ok') {
    throw new Error('Expected claim fixture to be valid.')
  }

  return state
}

function firstClaimId(state: PublishBusinessCatalogState) {
  const claim = state.claims.at(0)
  if (claim === undefined) {
    throw new Error('Expected claimed state to include a claim.')
  }

  return claim.claimId
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
        rawContactValue: 'sam-owner@example.test',
      },
    },
  ]
}

function validSecurity(key: string) {
  return {
    csrf: {
      csrfToken: `csrf-${key}`,
      csrfCookie: `csrf-${key}`,
      allowedOrigins: ['https://ae.example'],
    },
    rateLimit: {
      scope: 'claim_submit' as const,
      key,
      now: 1_000,
      limit: 5,
      windowMs: 60_000,
    },
  }
}
