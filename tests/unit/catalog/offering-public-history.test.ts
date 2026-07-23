import { describe, expect, it } from 'vitest'

import {
  resolveHistoricalPublicOffering,
  type BusinessOfferingRecord,
  type BusinessOfferingRevisionRecord,
  type OfferingPublicRevisionHistoryRecord,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'

const businessId = brandNonEmpty('business:studio', 'BusinessId')
const otherBusinessId = brandNonEmpty('business:other', 'BusinessId')
const offeringRef = brandNonEmpty('offering:studio:website', 'OfferingRef')
const selectedHash = brandNonEmpty('sha256:selected', 'SourceHash')
const currentHash = brandNonEmpty('sha256:current', 'SourceHash')

const offering: BusinessOfferingRecord = {
  businessId,
  offeringRef,
  currentRevision: 2,
  status: 'published',
  createdAt: 1,
  updatedAt: 20,
}

const selectedRevision: BusinessOfferingRevisionRecord = {
  businessId,
  offeringRef,
  revision: 1,
  name: 'Brochure website',
  category: 'Professional service',
  summary: 'A small informational website.',
  sourceHash: selectedHash,
  createdAt: 10,
}

const currentRevision: BusinessOfferingRevisionRecord = {
  ...selectedRevision,
  revision: 2,
  name: 'Brochure and commerce website',
  sourceHash: currentHash,
  createdAt: 20,
}

const history: OfferingPublicRevisionHistoryRecord = {
  businessId,
  offeringRef,
  revision: 1,
  offeringSourceHash: selectedHash,
  publishedAt: 11,
  withdrawnAt: 18,
  safeDisplayDisposition: 'retain_safe_history',
}

function resolve(
  overrides: Partial<Parameters<typeof resolveHistoricalPublicOffering>[0]> = {},
) {
  return resolveHistoricalPublicOffering({
    selection: { businessId, offeringRef, revision: 1, offeringSourceHash: selectedHash },
    business: { businessId, isPublic: true, isSuppressed: false },
    offering,
    selectedRevision,
    history,
    currentRevision,
    ...overrides,
  })
}

describe('historical public Offering resolution', () => {
  it('returns the exact previously public revision and reports a newer current revision separately', () => {
    const result = resolve()

    expect(result).toEqual({
      kind: 'resolved',
      revision: selectedRevision,
      publication: {
        publishedAt: 11,
        withdrawnAt: 18,
        safeDisplayDisposition: 'retain_safe_history',
      },
      newerCurrentRevision: {
        businessId,
        offeringRef,
        revision: 2,
        offeringSourceHash: currentHash,
      },
    })
    expect(result.kind === 'resolved' ? result.revision.revision : undefined).toBe(1)
  })

  it.each([
    ['never_public', { history: undefined }],
    ['business_mismatch', {
      history: { ...history, businessId: otherBusinessId },
    }],
    ['source_hash_mismatch', {
      history: { ...history, offeringSourceHash: currentHash },
    }],
    ['legacy_reference', {
      selection: {
        businessId,
        offeringRef: brandNonEmpty('legacy-offering:service-1', 'OfferingRef'),
        revision: 1,
        offeringSourceHash: selectedHash,
      },
    }],
  ] as const)('refuses %s without revealing selected facts', (reason, overrides) => {
    expect(resolve(overrides)).toEqual({ kind: 'unavailable', reason })
  })

  it.each([
    ['business_not_public', { business: { businessId, isPublic: false, isSuppressed: false } }],
    ['business_suppressed', { business: { businessId, isPublic: true, isSuppressed: true } }],
    ['privacy_withdrawn', {
      history: { ...history, safeDisplayDisposition: 'hidden_privacy' },
    }],
    ['safety_withdrawn', {
      history: { ...history, safeDisplayDisposition: 'hidden_safety' },
    }],
  ] as const)('applies live or retained-history suppression before returning facts: %s', (reason, overrides) => {
    expect(resolve(overrides)).toEqual({ kind: 'unavailable', reason })
  })
})
