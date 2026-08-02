import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import { convexModules as modules, publishedBusinessOwner } from '../helpers/convex-fixtures'

describe('capability publication security', () => {
  it('refuses anonymous publication without persisting any publication state', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'security-owner')

    await expect(backend.mutation(
      api.capabilitySupply.publishCapability,
      publicationArgs(businessId, 'anonymous'),
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })

    await expect(publicationRows(backend)).resolves.toEqual({ contracts: [], offerings: [], bindings: [] })
  })

  it('refuses a different business owner without persisting any publication state', async () => {
    const backend = convexTest(schema, modules)
    const target = await publishedBusinessOwner(backend, 'security-target')
    const attacker = await publishedBusinessOwner(backend, 'security-attacker')

    await expect(attacker.owner.mutation(
      api.capabilitySupply.publishCapability,
      publicationArgs(target.businessId, 'cross-business'),
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })

    await expect(publicationRows(backend)).resolves.toEqual({ contracts: [], offerings: [], bindings: [] })
  })

  it('leaves no partial contract when a later offering identity check refuses publication', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'security-atomic')
    const first = publicationArgs(businessId, 'first')
    const published = await owner.mutation(api.capabilitySupply.publishCapability, first)
    expect(published.kind).toBe('published')
    const before = await publicationRows(backend)

    const conflicting = publicationArgs(businessId, 'conflicting')
    conflicting.source.documentJson = JSON.stringify(capabilityContractV2({
      capabilityId: 'security.atomic.changed',
      name: 'Changed atomic capability',
    }))

    await expect(owner.mutation(api.capabilitySupply.publishCapability, conflicting))
      .resolves.toEqual({ kind: 'refused', reason: 'offering_identity_conflict' })

    await expect(publicationRows(backend)).resolves.toEqual(before)
  })
})

function publicationArgs(businessId: Id<'businesses'>, suffix: string) {
  return {
    businessId,
    source: {
      kind: 'ae_envelope' as const,
      documentJson: JSON.stringify(capabilityContractV2({
        capabilityId: 'security.atomic.lookup',
        name: 'Security atomic lookup',
      })),
    },
    offering: {
      offeringId: 'offering:security:atomic',
      networkId: 'ae:public',
      presentation: {
        label: 'Security atomic lookup',
        summary: 'Returns one bounded structured response.',
        price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 1_200 },
        materialTerms: [{ termId: 'response', label: 'Response', value: 'One structured response' }],
        commercialRelationship: {
          kind: 'none' as const,
          summary: 'No commercial influence.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ['business:commercial-neutrality'],
        },
      },
      searchTerms: ['security', 'lookup'],
      registrationEvidenceRefs: ['business:capability-publication'],
    },
    binding: {
      bindingId: 'binding:security:atomic:http',
      endpointUrl: 'https://security.example.test/capability',
      credentialRef: 'env:SECURITY_CAPABILITY_KEY',
      continuation: { kind: 'single_response' as const, evidenceRefs: ['business:http-response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['business:no-cancellation'] },
      adapter: { adapterId: 'http-json:v1', config: { method: 'POST' as const, requestTimeoutMs: 5_000 } },
      registrationEvidenceRefs: ['business:http-binding'],
    },
    operationKey: `op:capability-publication-security:${suffix}`,
    correlationId: `corr:capability-publication-security:${suffix}`,
    reasonCode: 'business_capability_publication',
    evidenceRefs: ['test:capability-publication-security'],
  }
}

async function publicationRows(backend: ReturnType<typeof convexTest>) {
  return await backend.run(async (ctx) => ({
    contracts: await ctx.db.query('capabilityContractDocuments').collect(),
    offerings: await ctx.db.query('capabilityOfferings').collect(),
    bindings: await ctx.db.query('capabilityTransportBindings').collect(),
  }))
}
