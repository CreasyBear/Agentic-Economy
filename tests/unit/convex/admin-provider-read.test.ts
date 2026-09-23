/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import {
  convexTestWithMarketComponents,
  nonAdmin,
  ownerAdmin,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const providerSlug = 'provider-one'
const toolRef = `operation:v1:${'a'.repeat(64)}`

async function seedBusiness(
  backend: ConvexFixtureBackend,
  slug: string,
  kind: 'programmable_provider' | 'local_human',
  suppressedAt?: number,
) {
  return await backend.run(async (ctx) => await ctx.db.insert('businesses', {
    owningAccountRef: `acc_${slug.replaceAll('-', '').padEnd(32, '0').slice(0, 32)}`,
    slug,
    name: `Private ${slug}`,
    normalizedName: `private ${slug}`,
    category: 'software',
    businessContext: kind === 'programmable_provider'
      ? { kind, website: 'https://provider.example', providerIdentifier: `provider:${slug}` }
      : { kind, suburb: 'Perth', stateTerritory: 'WA', publishedPhone: '+61 400 000 000' },
    publicStatus: suppressedAt === undefined ? 'published' : 'suppressed',
    trustTier: 'listed',
    sourceHash: `source:${slug}`,
    createdAt: 1,
    updatedAt: 2,
    ...(suppressedAt === undefined ? {} : { suppressedAt }),
  }))
}

async function seedProviderView(backend: ConvexFixtureBackend): Promise<void> {
  const businessId = await seedBusiness(backend, providerSlug, 'programmable_provider')
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityPublications', {
      publicationRef: 'publication:provider-one',
      toolRef,
      revision: 1,
      businessId,
      networkId: 'ae:public',
      runtimeEnvironment: 'production',
      capabilityId: 'provider.lookup',
      version: 1,
      contractDigest: `sha256:${'b'.repeat(64)}`,
      sourceKind: 'openapi_http',
      sourceRevision: '1',
      sourceDigest: `sha256:${'c'.repeat(64)}`,
      publisherRef: 'principal:provider-one',
      authorityMode: 'provider_owned',
      provenanceDigest: `sha256:${'d'.repeat(64)}`,
      offeringId: 'offering:provider-one',
      bindingId: 'binding:provider-one',
      disposition: 'current',
      sourceAuthorityState: 'review_required',
      credentialState: 'ready',
      healthState: 'healthy',
      readinessEvidenceRefs: [],
      registrationEvidenceRefs: [],
      createdAt: 1,
      updatedAt: 2,
    })
    await ctx.db.insert('capabilityProviderConnections', {
      connectionRef: 'connection:provider-one',
      owningAccountRef: 'acc_providerone00000000000000000000',
      installedByPrincipalRef: 'principal:provider-one',
      authorityGrantRef: 'grant:provider-one',
      authorityGrantGeneration: 1,
      secretRef: 'secret:must-not-leak',
      businessId,
      providerRef: 'provider:provider-one',
      providerAccountRef: 'account:provider-one',
      adapterId: 'x402-fetch:v2',
      credentialRef: 'credential:must-not-leak',
      sourceEnvironment: 'production',
      sourceAuthentication: { kind: 'http_bearer' },
      x402Payee: '0xmust-not-leak',
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 1,
      authorityDigest: `sha256:${'e'.repeat(64)}`,
      lifecycle: 'active',
      observedAt: 1,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 2,
      lastCommandId: 'command:provider-one',
      lastCommandDigest: `sha256:${'f'.repeat(64)}`,
    })
  })
}

describe('admin Provider reads', () => {
  it('returns the Provider view without private business or connection fields', async () => {
    const backend = convexTestWithMarketComponents()
    await seedProviderView(backend)
    const caller = await ownerAdmin(backend, 'user_admin-provider-owner')

    const result = await caller.query(api.adminConsoleObjects.readAdminObject, {
      ref: { kind: 'provider', ref: providerSlug },
    })
    expect(result).toMatchObject({
      kind: 'provider',
      slug: providerSlug,
      publications: [{ ref: toolRef }],
      connections: [{ connectionRef: 'connection:provider-one' }],
      payout: 'unavailable',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('secretRef')
    expect(serialized).not.toContain('x402Payee')
    expect(serialized).not.toContain('"name"')
    expect(serialized).not.toContain('phone')
    expect(serialized).not.toContain('Private provider-one')
    expect(serialized).not.toContain('+61 400 000 000')
  })

  it('does not treat a local human Business as a Provider', async () => {
    const backend = convexTestWithMarketComponents()
    await seedBusiness(backend, 'local-one', 'local_human')
    const caller = await ownerAdmin(backend, 'user_admin-provider-local')

    await expect(caller.query(api.adminConsoleObjects.readAdminObject, {
      ref: { kind: 'provider', ref: 'local-one' },
    })).resolves.toEqual({ kind: 'object_not_found' })
  })

  it('lists only suppressed Providers for the suppressed filter', async () => {
    const backend = convexTestWithMarketComponents()
    await seedBusiness(backend, 'provider-visible', 'programmable_provider')
    await seedBusiness(backend, 'provider-suppressed', 'programmable_provider', 10)
    await seedBusiness(backend, 'human-suppressed', 'local_human', 11)
    const caller = await ownerAdmin(backend, 'user_admin-provider-list')

    const result = await caller.query(api.adminConsoleProviders.listAdminProviders, {
      filter: 'suppressed',
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(result.page.map((row) => row.slug)).toEqual(['provider-suppressed'])
  })

  it('returns the empty pagination envelope to a non-admin', async () => {
    const backend = convexTestWithMarketComponents()
    await seedBusiness(backend, 'provider-hidden', 'programmable_provider')
    const caller = await nonAdmin(backend, 'user_admin-provider-denied')

    await expect(caller.query(api.adminConsoleProviders.listAdminProviders, {
      filter: 'all',
      paginationOpts: { numItems: 50, cursor: null },
    })).resolves.toEqual({ page: [], isDone: true, continueCursor: '' })
  })
})
