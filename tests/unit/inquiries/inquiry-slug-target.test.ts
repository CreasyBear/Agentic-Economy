import { describe, expect, it } from 'vitest'

import { submitPublicInquiryThroughSource } from '@/modules/inquiries/inquiry.functions'
import {
  createLocalE2eRegistrySourceState,
  getPublicBusinessCatalogBySlug,
  resolvePublishedInquiryTarget,
} from '@/modules/registry/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import type { SuppressionRuleRecord } from '@/modules/security/public'

const expectedDigest = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('inquiry.submit slug target resolution', () => {
  it('resolves a published slug pair to source ids through the real local registry functions', () => {
    const state = createLocalE2eRegistrySourceState()
    const { businessSlug, serviceSlug } = publishedTarget(state)

    expect(resolvePublishedInquiryTarget(state, { businessSlug, serviceSlug })).toEqual({
      kind: 'resolved',
      businessId: 'business:plumbing-demo',
      serviceId: 'service:business:plumbing-demo:diagnostic-plumbing',
    })
  })

  it('returns inquiry_target_not_found for an unknown business slug through the explicit local source path', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await submitPublicInquiryThroughSource({
        target: {
          businessSlug: 'no-such-business',
          serviceSlug: 'no-such-service',
          capabilityKind: 'phone_inquiry',
        },
        body: 'Testing an unknown target.',
        contact: { name: 'Casey' },
        expectedDigest,
      })

      expect(result).toEqual({
        kind: 'error',
        code: 'inquiry_target_not_found',
        retryable: false,
        reason: 'No published business is discoverable for this slug.',
      })
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalRegistry)
    }
  })

  it('returns inquiry_target_not_found when the service slug is not on the published business', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await submitPublicInquiryThroughSource({
        target: {
          businessSlug: 'plumbing-demo',
          serviceSlug: 'not-a-published-service',
          capabilityKind: 'phone_inquiry',
        },
        body: 'Testing a service that is not published on this business.',
        contact: { name: 'Casey' },
        expectedDigest,
      })

      expect(result).toEqual({
        kind: 'error',
        code: 'inquiry_target_not_found',
        retryable: false,
        reason: 'No published service is discoverable for this slug on the business.',
      })
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalRegistry)
    }
  })

  it('never resolves a suppressed business, even for an otherwise published slug pair', () => {
    const state = createLocalE2eRegistrySourceState()
    const { businessSlug, serviceSlug } = publishedTarget(state)
    const resolved = resolvePublishedInquiryTarget(state, { businessSlug, serviceSlug })
    expect(resolved.kind).toBe('resolved')
    if (resolved.kind !== 'resolved') {
      return
    }

    const suppressed: RegistrySourceState = {
      ...state,
      suppressionRules: [suppressionRuleFor(resolved.businessId)],
    }

    expect(resolvePublishedInquiryTarget(suppressed, { businessSlug, serviceSlug })).toEqual({
      kind: 'not_found',
      reason: 'No published business is discoverable for this slug.',
    })
  })
})

function publishedTarget(state: RegistrySourceState): { businessSlug: string; serviceSlug: string } {
  const detail = getPublicBusinessCatalogBySlug(state, { slug: 'plumbing-demo' })
  if (detail.kind !== 'found') {
    throw new Error('Expected the seeded local e2e catalog to publish plumbing-demo.')
  }
  const service = detail.business.services[0]
  if (service === undefined) {
    throw new Error('Expected the seeded local e2e catalog to publish at least one service.')
  }
  return { businessSlug: detail.business.slug, serviceSlug: service.slug }
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
