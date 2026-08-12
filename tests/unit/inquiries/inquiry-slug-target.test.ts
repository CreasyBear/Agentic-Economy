import { describe, expect, it } from 'vitest'

import { submitPublicInquiryThroughSource } from '@/modules/inquiries/inquiry.functions'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  resolvePublishedInquiryTarget,
  searchPublicBusinessOfferingSupply,
} from '@/modules/registry/public'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
import { createLocalE2eRegistrySourceState } from '../../helpers/registry-local-e2e'
import type { RegistrySourceState } from '@/modules/registry/public'
import type { SuppressionRuleRecord } from '@/modules/security/public'

const expectedDigest = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('inquiry.submit slug target resolution', () => {
  it('resolves a published business slug and Offering reference to source ids through the real local registry functions', () => {
    const state = createLocalE2eRegistrySourceState()
    const { businessSlug, offeringRef } = publishedTarget(state)

    expect(resolvePublishedInquiryTarget(state, { businessSlug, offeringRef })).toEqual({
      kind: 'resolved',
      businessId: 'business:plumbing-demo',
      offeringRef,
    })
  })

  it('returns inquiry_target_not_found for an unknown business slug through the explicit test registry port', async () => {
    const result = await withFixtureRegistry(() => submitPublicInquiryThroughSource({
      target: {
        businessSlug: 'no-such-business',
        offeringRef: 'offering:no-such-business:no-such-offering',
      },
      body: 'Testing an unknown target.',
      contact: { name: 'Casey' },
      expectedDigest,
    }))

    expect(result).toEqual({
      kind: 'error',
      code: 'inquiry_target_not_found',
      retryable: false,
      reason: 'No published Offering is discoverable for this slug on the business.',
    })
  })

  it('returns inquiry_target_not_found when the Offering reference is not on the published business', async () => {
    const result = await withFixtureRegistry(() => submitPublicInquiryThroughSource({
      target: {
        businessSlug: 'plumbing-demo',
        offeringRef: 'offering:plumbing-demo:not-a-published-offering',
      },
      body: 'Testing an Offering that is not published on this business.',
      contact: { name: 'Casey' },
      expectedDigest,
    }))

    expect(result).toEqual({
      kind: 'error',
      code: 'inquiry_target_not_found',
      retryable: false,
      reason: 'No published Offering is discoverable for this slug on the business.',
    })
  })

  it('never resolves a suppressed business, even for an otherwise published slug and Offering reference', () => {
    const state = createLocalE2eRegistrySourceState()
    const { businessSlug, offeringRef } = publishedTarget(state)
    const resolved = resolvePublishedInquiryTarget(state, { businessSlug, offeringRef })
    expect(resolved.kind).toBe('resolved')
    if (resolved.kind !== 'resolved') {
      return
    }

    const suppressed: RegistrySourceState = {
      ...state,
      suppressionRules: [suppressionRuleFor(resolved.businessId)],
    }

    expect(resolvePublishedInquiryTarget(suppressed, { businessSlug, offeringRef })).toEqual({
      kind: 'not_found',
      reason: 'No published Offering is discoverable for this slug on the business.',
    })
  })
})

async function withFixtureRegistry<T>(run: () => Promise<T>): Promise<T> {
  const state = createLocalE2eRegistrySourceState()
  const restore = setPublicRegistrySourcePortForTests({
    list: (input) => Promise.resolve(listPublicBusinessOfferingSupply(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessOfferingSupply(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessOfferingSupplyBySlug(state, input)),
    resolveInquiryTarget: (input) => Promise.resolve(resolvePublishedInquiryTarget(state, input)),
  })
  try {
    return await run()
  } finally {
    restore()
  }
}

function publishedTarget(state: RegistrySourceState): { businessSlug: string; offeringRef: string } {
  const detail = getPublicBusinessOfferingSupplyBySlug(state, { slug: 'plumbing-demo' })
  if (detail.kind !== 'found') {
    throw new Error('Expected the seeded local e2e catalog to publish plumbing-demo.')
  }
  const offering = detail.business.offerings[0]
  if (offering === undefined) {
    throw new Error('Expected the seeded local e2e catalog to publish at least one Offering.')
  }
  return { businessSlug: detail.business.slug, offeringRef: offering.offeringRef }
}

function suppressionRuleFor(businessId: string): SuppressionRuleRecord {
  return {
    targetType: 'business',
    targetRef: businessId,
    status: 'active',
    reasonCode: 'privacy_review',
    evidenceRefs: ['evidence:suppression'],
    createdByAdminRef: 'admin:test',
    createdAt: 1,
    beforePublicStatus: 'published',
    beforeClaimStatus: 'published',
  }
}

