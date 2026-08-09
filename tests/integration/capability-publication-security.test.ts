import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import { convexModules as modules, publishedBusinessOwner, type ConvexFixtureBackend } from '../helpers/convex-fixtures'
import type { CapabilityTransportAuthority } from '@/modules/capability-supply/public'

const SECURITY_AUTHORITY: CapabilityTransportAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:capability-publication-security',
  providerRef: 'provider:capability-publication-security',
}

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
    await registerProviderConnection(backend, businessId)
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
async function registerProviderConnection(backend: ConvexFixtureBackend, businessId: Id<'businesses'>) {
  if (SECURITY_AUTHORITY.kind !== 'provider_connection') {
    throw new Error('provider connection fixture authority kind changed')
  }
  const result = await backend.mutation(internal.capabilityProviderConnections.create, {
    commandId: 'command:create:capability-publication-security',
    connectionRef: SECURITY_AUTHORITY.connectionRef,
    businessId,
    providerRef: SECURITY_AUTHORITY.providerRef,
    providerAccountRef: 'account:capability-publication-security',
    adapterId: 'http-json:v1',
    credentialRef: 'env:SECURITY_CAPABILITY_KEY',
    requestedScopes: ['capability:security.atomic.lookup'],
    grantedScopes: ['capability:security.atomic.lookup'],
    requestedResources: ['endpoint:https://security.example.test/capability'],
    grantedResources: ['endpoint:https://security.example.test/capability'],
    evidenceRefs: ['test:provider-connection:capability-publication-security'],
    now: 1,
  })
  if (result.kind !== 'applied') throw new Error(`provider_connection_fixture_${result.kind}`)
}


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
        price: { kind: 'fixed' as const, amount: { currency: 'AUD', units: '1200', exponent: 2 } },
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
      authority: SECURITY_AUTHORITY,
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
