import { describe, expect, it } from 'vitest'

import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'
import { createEmptyCatalogSourceState, publishBusinessCatalog } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { runAnswerToolUseAgent, setAnswerToolUseAgentForTests } from '@/modules/answer/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../../helpers/source-ports'

describe('tool-use agent inquiry deep links', () => {
  it('surfaces inquiryUrl when the published service supports human inquiry', async () => {
    const state = createInquiryReadyRegistryState()

    await withRegistrySourcePortForTest(state, async () => {
      const reset = setAnswerToolUseAgentForTests(async () => ({
        toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumber parramatta' } }],
        prose: {
          oneLine: 'One listed business matches this need.',
          summary:
            'The listing publishes inquiry options. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
          whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
        },
      }))

      try {
        const result = await runAnswerToolUseAgent({ query: 'emergency plumber parramatta' })
        const provider = result.providers.find((candidate) => candidate.slug === 'plumbing-demo')
        expect(provider?.inquiryUrl).toBe('/plumbing-demo/inquiry')
        expect(provider?.nextStepLabel).toBe('Send inquiry')
      } finally {
        reset()
      }
    })
  })
})

function createInquiryReadyRegistryState(): RegistrySourceState {
  const state: RegistrySourceState = {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
  }

  const claim = claimBusiness(state, {
    actor: { kind: 'authenticated_owner', clerkUserId: 'owner:plumbing-demo', displayName: 'Demo Owner' },
    facts: {
      name: 'Demo Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      requestedSlug: 'plumbing-demo',
      ownerMessage: 'Inquiry-ready dev fixture.',
      sourceRefs: [
        {
          label: 'Owner supplied service facts',
          evidenceRef: 'private:evidence:plumbing-demo',
          sourceHash: brandNonEmpty('hash:plumbing-demo', 'SourceHash'),
        },
      ],
    },
    security: {
      csrf: matchingCsrf('claim'),
      rateLimit: { scope: 'claim_submit', key: 'plumbing-demo', now: 1_000, limit: 5, windowMs: 60_000 },
    },
    operationKey: operationKey('claim'),
    correlationId: correlationId('claim'),
    now: 1_000,
  })

  if (claim.kind === 'error') {
    throw new Error(claim.reason)
  }

  const publish = publishBusinessCatalog(state, {
    actor: { kind: 'authenticated_owner', clerkUserId: 'owner:plumbing-demo', displayName: 'Demo Owner' },
    claimId: claim.claim.claimId,
    services: [
      {
        name: 'Emergency plumbing',
        category: 'Emergency plumbing',
        summary: 'Human triage for urgent plumbing issues.',
        serviceArea: 'Parramatta',
        hoursOrUnknown: 'Hours supplied by owner',
        firstRequest: {
          mode: 'inquiry_available',
          publicChannel: 'public_business_contact',
          publicDisclosure: 'Use the inquiry form for a first contact.',
        },
      },
    ],
    security: { csrf: matchingCsrf('publish') },
    operationKey: operationKey('publish'),
    correlationId: correlationId('publish'),
    now: 2_000,
  })

  if (publish.kind === 'error') {
    throw new Error(publish.reason)
  }

  return state
}

function matchingCsrf(key: string) {
  return {
    origin: 'https://ae.example',
    allowedOrigins: ['https://ae.example'],
  }
}

function operationKey(value: string) {
  return brandNonEmpty(`op:inquiry-deep-link:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`corr:inquiry-deep-link:${value}`, 'CorrelationId')
}
