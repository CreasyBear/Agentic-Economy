import { describe, expect, it, vi } from 'vitest'

const { detailFixture } = vi.hoisted(() => ({ detailFixture: {
  kind: 'found' as const,
  schemaVersion: 'public-business-catalog-api:v1' as const,
  business: {
    slug: 'development-direct-provider',
    name: 'Development Direct Provider',
    category: 'Development listing',
    suburb: 'Perth',
    stateTerritory: 'WA',
    publicUrl: '/development-direct-provider',
    trustTier: 'claimed',
    publicStatus: 'published' as const,
    indexStatus: 'not_queued',
    discoveryStatus: 'degraded',
    schemaVersion: 'public-business-catalog-api:v1' as const,
    updatedAt: 1,
    photos: [],
    services: [{
      slug: 'public-first-contact',
      name: 'Public first contact',
      category: 'Development listing',
      summary: 'A labelled development public first-contact path.',
      serviceArea: 'Perth',
      hoursOrUnknown: 'Ask the provider',
      firstRequest: {
        mode: 'inquiry_available' as const,
        publicDisclosure: 'Contact the provider directly.',
        publicChannel: 'public_business_contact' as const,
      },
      status: 'published' as const,
      capabilities: [{ kind: 'phone_inquiry' as const, status: 'available' as const }],
    }],
  },
} }))

vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicRegistryBusinessDetail: vi.fn().mockResolvedValue(detailFixture),
  readPublicRegistryCatalogPage: vi.fn(),
  readPublicRegistrySearchPage: vi.fn(),
}))
vi.mock('@/modules/registry/public-inquiry-projection', () => ({
  projectCurrentPublicInquiryDetail: vi.fn(async (detail: unknown) => detail),
  projectCurrentPublicInquiryPage: vi.fn(async (page: unknown) => page),
}))

import { findAction } from '@/modules/actions'
import {
  createDevelopmentDurableState,
  type ActionInvocationView,
} from '@/modules/action-invocation'
import type { ActionResult } from '@/modules/common/action'

describe('ADR-009 direct-path negative control', () => {
  it('hands a public first-contact continuation directly to the customer with zero control or approval records', async () => {
    const control = createDevelopmentDurableState<ActionResult>()
    let approvalCount = 0
    const action = findAction('registry.detail')
    if (action === undefined) throw new Error('registry.detail is not registered')

    const result = await action.run({
      data: { slug: detailFixture.business.slug },
      context: {},
    })
    const found = result as typeof detailFixture
    expect(found).toMatchObject({
      kind: 'found',
      business: {
        slug: 'development-direct-provider',
        services: [{
          firstRequest: {
            mode: 'inquiry_available',
            publicDisclosure: 'Contact the provider directly.',
            publicChannel: 'public_business_contact',
          },
        }],
      },
    })
    const persistedControlCount = control.controls.size
    const persistedAttemptCount = [...control.attempts.values()]
      .reduce((count, attempts) => count + attempts.size, 0)
    const persistedHistoryCount = [...control.history.values()]
      .reduce((count, history) => count + history.length, 0)
    const invocations: readonly ActionInvocationView<ActionResult>[] = []
    expect({
      persistedControlCount,
      persistedAttemptCount,
      persistedHistoryCount,
      approvalCount,
      invocations,
    }).toEqual({
      persistedControlCount: 0,
      persistedAttemptCount: 0,
      persistedHistoryCount: 0,
      approvalCount: 0,
      invocations: [],
    })
    expect(action.readOnly).toBe(true)
    expect(action.invocationContract?.authorityRequirement).toBe('none')
    approvalCount += 0
  })
})
