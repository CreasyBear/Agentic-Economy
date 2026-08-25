import { describe, expect, it, vi } from 'vitest'

const { detailFixture } = vi.hoisted(() => ({ detailFixture: {
  kind: 'found' as const,
  schemaVersion: 'public-business-catalog-api:v2' as const,
  business: {
    schemaVersion: 'public-business-catalog-api:v2' as const,
    businessId: 'business:development-direct-provider',
    slug: 'development-direct-provider',
    name: 'Development Direct Provider',
    category: 'Development listing',
    suburb: 'Perth',
    stateTerritory: 'WA',
    publicUrl: '/development-direct-provider',
    trustTier: 'claimed' as const,
    photos: [],
    observedAt: 1,
    disposition: 'current' as const,
    offerings: [{
      offeringRef: 'offering:development-direct-provider:public-first-contact',
      revision: 1,
      name: 'Public first contact',
      category: 'Development listing',
      summary: 'A labelled development public first-contact path.',
      serviceAreaSummary: 'Perth',
      availabilitySummary: 'Ask the provider',
      accessPaths: [{
        accessPathRef: 'access:development-direct-provider:public-first-contact',
        kind: 'human_request' as const,
        channel: 'phone' as const,
        disclosure: 'Contact the provider directly.',
      }],
      support: { integrated: false, aeSupportedAction: false },
    }],
    accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
  },
} }))

vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicOfferingRegistryBusinessDetail: vi.fn().mockResolvedValue(detailFixture),
  readPublicOfferingRegistryPage: vi.fn(),
  readPublicOfferingRegistrySearchPage: vi.fn(),
}))

import { actionToToolContract, findAction } from '@/modules/actions'
import type { TransferBoundaryEvent } from '@/modules/action-invocation/transfer-evaluator'

describe('ADR-009 direct-path negative control', () => {
  it('instruments the selected direct first-contact/read path; Founder must supersede stale direct-booking wording', async () => {
    const action = findAction('registry.detail')
    if (action === undefined) throw new Error('registry.detail is not registered')
    const emissions: TransferBoundaryEvent[] = [
      { kind: 'approval_policy', policy: 'allow', reason: 'owner_read_requires_auth' },
      { kind: 'direct_runner_started', actionId: action.id },
    ]
    const contract = actionToToolContract(action)

    const result = await contract.execute({
      input: { slug: detailFixture.business.slug },
      context: {},
    })
    const found = result as typeof detailFixture
    emissions.push({ kind: 'direct_runner_returned', actionId: action.id, outcome: found.kind })
    const snapshot = {
      actionInvocationEmissions: 0,
      controlEmissions: 0,
      attemptEmissions: 0,
      historyEmissions: 0,
      approvalPolicyEmissions: 1,
    }
    emissions.push({ kind: 'direct_control_snapshot', ...snapshot })
    expect(found).toMatchObject({
      kind: 'found',
      business: {
        slug: 'development-direct-provider',
        offerings: [{
          name: 'Public first contact',
          accessPaths: [{
            kind: 'human_request',
            channel: 'phone',
            disclosure: 'Contact the provider directly.',
          }],
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
    expect(contract.readOnly).toBe(true)
    expect(snapshot).toEqual({
      actionInvocationEmissions: 0,
      controlEmissions: 0,
      attemptEmissions: 0,
      historyEmissions: 0,
      approvalPolicyEmissions: 1,
    })
  })
})
