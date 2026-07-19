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
  actionToHarnessToolContract,
  createHarnessToolBoundaryInstrumentation,
  type HarnessToolBoundaryEvent,
} from '@/modules/harness/tool-contract'

describe('ADR-009 direct-path negative control', () => {
  it('instruments the selected direct first-contact/read path; Founder must supersede stale direct-booking wording', async () => {
    const action = findAction('registry.detail')
    if (action === undefined) throw new Error('registry.detail is not registered')
    const emissions: HarnessToolBoundaryEvent[] = []
    const instrumentation = createHarnessToolBoundaryInstrumentation(
      (event) => emissions.push(event),
    )
    const contract = actionToHarnessToolContract(action, instrumentation)

    const result = await contract.execute({
      input: { slug: detailFixture.business.slug },
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
    expect(emissions).toEqual([
      { kind: 'approval_policy', policy: 'allow', reason: 'owner_read_requires_auth' },
      { kind: 'direct_runner_started', actionId: 'registry.detail' },
      { kind: 'direct_runner_returned', actionId: 'registry.detail', outcome: 'found' },
      {
        kind: 'direct_control_snapshot',
        actionInvocationEmissions: 0,
        controlEmissions: 0,
        attemptEmissions: 0,
        historyEmissions: 0,
        approvalPolicyEmissions: 1,
      },
    ])
    expect(action.readOnly).toBe(true)
    expect(action.invocationContract?.authorityRequirement).toBe('none')
    expect(contract.policy).toMatchObject({
      tier: 'read',
      approval: { policy: 'allow' },
    })
    expect(instrumentation.snapshot()).toEqual({
      actionInvocationEmissions: 0,
      controlEmissions: 0,
      attemptEmissions: 0,
      historyEmissions: 0,
      approvalPolicyEmissions: 1,
    })
  })
})
