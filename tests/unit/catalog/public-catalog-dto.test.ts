import { describe, expect, it } from 'vitest'

import type { PublicCatalogReadState } from '@/modules/catalog/public'
import { getPublicBusinessCatalog } from '@/modules/registry/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const businessId = brandNonEmpty('business:parramatta', 'BusinessId')
const slug = brandNonEmpty('demo-listed-provider', 'Slug')
const offeringRef = brandNonEmpty('offering:demo-listed-provider:pipe-repair', 'OfferingRef')
const revisionSourceHash = canonicalDigest('offering-revision')

const business = {
  businessId,
  ownerId: brandNonEmpty('owner:sam', 'OwnerId'),
  slug,
  name: 'Demo listed provider',
  normalizedName: 'demo listed provider',
  category: 'Listed provider',
  businessContext: {
    kind: 'local_human' as const,
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publishedPhone: '0412 345 678',
  },
  publicStatus: 'published' as const,
  trustTier: 'claimed' as const,
  sourceHash: canonicalDigest('business'),
  createdAt: 1,
  updatedAt: 2,
}

const context = {
  businessId,
  category: 'Emergency plumbing',
  businessContext: {
    kind: 'local_human' as const,
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publishedPhone: '0412 345 678',
  },
  sourceRefs: [],
  sourceHash: canonicalDigest('business-context'),
  approvedAt: 2,
}

const offering = {
  offeringRef,
  businessId,
  currentRevision: 1,
  status: 'published' as const,
  createdAt: 3,
  updatedAt: 3,
}

const revision = {
  offeringRef,
  businessId,
  revision: 1,
  name: 'Listed offering',
  category: 'Emergency plumbing',
  summary: 'Burst pipe triage and repair.',
  serviceAreaSummary: 'Parramatta and nearby suburbs',
  availabilitySummary: 'Hours supplied by owner',
  sourceHash: revisionSourceHash,
  createdAt: 3,
}

const accessPath = {
  accessPathRef: brandNonEmpty('access:parramatta:pipe-repair:human', 'AccessPathRef'),
  businessId,
  offeringRef,
  offeringRevision: 1,
  offeringSourceHash: revisionSourceHash,
  status: 'published' as const,
  descriptor: {
    kind: 'human_request' as const,
    channel: 'phone' as const,
    disclosure: 'Ask the business to begin a safe request.',
  },
  sourceHash: canonicalDigest('access-path'),
  createdAt: 3,
  updatedAt: 3,
}

function readState(overrides: Partial<Pick<PublicCatalogReadState, 'offerings' | 'revisions' | 'accessPaths'>> = {}): PublicCatalogReadState {
  return {
    owners: [],
    businesses: [business],
    businessContexts: [context],
    offerings: overrides.offerings ?? [offering],
    revisions: overrides.revisions ?? [revision],
    accessPaths: overrides.accessPaths ?? [accessPath],
  }
}

describe('public catalog DTO', () => {
  it('hides a published business until a current published Offering exists', () => {
    expect(getPublicBusinessCatalog(readState({ offerings: [], revisions: [], accessPaths: [] }), {
      slug,
      indexStatus: 'queued',
      discoveryStatus: 'degraded',
    })).toEqual({ kind: 'hidden', reason: 'not_published' })
  })

  it('projects current Offering facts and public access paths without private owner data', () => {
    const result = getPublicBusinessCatalog(readState(), {
      slug,
      indexStatus: 'queued',
      discoveryStatus: 'degraded',
    })

    expect(result).toMatchObject({
      kind: 'available',
      catalog: {
        schemaVersion: 'public-business-catalog-api:v2',
        slug: 'demo-listed-provider',
        businessContext: {
          kind: 'local_human',
          stateTerritory: 'NSW',
          publishedPhone: '0412 345 678',
        },
        disposition: 'partial',
        offerings: [
          {
            offeringRef,
            revision: 1,
            name: 'Listed offering',
            summary: 'Burst pipe triage and repair.',
            accessPaths: [{ kind: 'human_request', channel: 'phone' }],
          },
        ],
      },
    })
    expect(JSON.stringify(result)).not.toContain('ownerId')
    expect(JSON.stringify(result)).not.toContain('sourceHash')
    expect(JSON.stringify(result)).not.toContain('sam-owner@example.test')
  })
})
