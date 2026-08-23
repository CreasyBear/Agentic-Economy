import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'

import { admitFacilitatorDiscoveryItems } from '../../convex/facilitatorDiscoveryAction'
import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { admitRegistryPaymentRequiredItem } from '@/modules/capability-supply/internal/facilitator-discovery-admission'
import timezoneFixture from '@/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json'
import { convexModules } from '../helpers/convex-fixtures'

describe('facilitator discovery reconciliation', () => {
  it('creates deterministic provider state and replays the same publication', async () => {
    const backend = convexTest(schema, convexModules)
    const deadlineAt = Date.now() + 60_000
    const admission = await admitFacilitatorDiscoveryItems([timezoneFixture.paymentRequired])
    const item = admission.admitted[0]
    expect(item).toBeDefined()
    if (item === undefined) throw new Error('expected recorded discovery admission')

    const first = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: Array.from({ length: 21 }, () => item),
      complete: false,
      deadlineAt,
    })
    const second = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [item],
      complete: false,
      deadlineAt,
    })
    expect(first).toMatchObject({ admitted: 21, published: 1, skipped: 20 })
    expect(second).toMatchObject({ admitted: 1, published: 0, skipped: 1 })

    const persisted = await backend.run(async (ctx) => ({
      businesses: await ctx.db.query('businesses').collect(),
      owners: await ctx.db.query('owners').collect(),
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      publications: await ctx.db.query('capabilityPublications').collect(),
    }))
    expect(persisted.businesses).toHaveLength(1)
    expect(persisted.owners[0]?.clerkUserId).toMatch(/^system:facilitator-discovery:/u)
    expect(persisted.connections[0]).toMatchObject({
      providerRef: 'provider:x402:402timezones.vercel.app',
      providerAccountRef: 'x402:https://402timezones.vercel.app/api/convert-timezone',
      adapterId: 'x402-fetch:v2',
      credentialRef: null,
    })
    expect(persisted.publications).toHaveLength(1)
    expect(persisted.publications[0]).toMatchObject({
      authorityMode: 'observed_external',
      publisherRef: 'system:facilitator-discovery',
    })
    expect(JSON.parse(persisted.publications[0]?.pricingConfigJson ?? '{}')).toMatchObject({
      version: 'pricing:v2',
      providerAmount: { units: '1000' },
      platformFee: { units: '100' },
      paidAmount: { units: '1100' },
    })

    const refreshed = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [{ ...item, sourceRevision: `${item.sourceRevision}-refresh` }],
      complete: false,
      deadlineAt,
    })
    expect(refreshed).toMatchObject({ published: 1, skipped: 0 })
    await expect(backend.run(async (ctx) => (await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', item.offering.offeringId))
      .order('desc').collect()).find((publication) => publication.disposition === 'current')))
      .resolves.toMatchObject({ authorityMode: 'observed_external', publisherRef: 'system:facilitator-discovery' })

    const withdrawn = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [],
      complete: true,
      seenPublicationRefs: [],
      deadlineAt,
    })
    expect(withdrawn.withdrawn).toBe(1)
    await expect(backend.run(async (ctx) => ({
      business: await ctx.db.query('businesses').unique(),
      current: await ctx.db.query('capabilityPublications')
        .withIndex('by_networkId_and_disposition', (query) => (
          query.eq('networkId', 'ae:public').eq('disposition', 'current')
        )).collect(),
    }))).resolves.toMatchObject({
      business: { publicStatus: 'unpublished' },
      current: [],
    })
  })

  it('rejects refresh and withdrawal for non-observed facilitator provenance', async () => {
    const backend = convexTest(schema, convexModules)
    const deadlineAt = Date.now() + 60_000
    const admission = await admitFacilitatorDiscoveryItems([timezoneFixture.paymentRequired])
    const item = admission.admitted[0]
    expect(item).toBeDefined()
    if (item === undefined) throw new Error('expected recorded discovery admission')
    await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [item],
      complete: false,
      deadlineAt,
    })
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications').unique()
      if (publication === null) throw new Error('expected facilitator publication')
      await ctx.db.patch(publication._id, { authorityMode: 'ae_curated_external' })
    })

    const changedAdmission = await admitFacilitatorDiscoveryItems([{
      ...timezoneFixture.paymentRequired,
      accepts: timezoneFixture.paymentRequired.accepts.map((accept) => ({ ...accept, amount: '2000' })),
    }])
    const changedItem = changedAdmission.admitted[0]
    expect(changedItem).toBeDefined()
    if (changedItem === undefined) throw new Error('expected changed discovery admission')
    const refreshAttempt = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [changedItem],
      complete: false,
      deadlineAt,
    })
    expect(refreshAttempt).toMatchObject({ published: 0, skipped: 1 })
    const withdrawalAttempt = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [],
      complete: true,
      seenPublicationRefs: [],
      deadlineAt,
    })
    expect(withdrawalAttempt).toMatchObject({ withdrawn: 0 })
    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityPublications').unique()))
      .resolves.toMatchObject({ disposition: 'current', authorityMode: 'ae_curated_external' })
  })

  it('does not withdraw a registry-graduated Operation during facilitator refresh', async () => {
    const backend = convexTest(schema, convexModules)
    const deadlineAt = Date.now() + 60_000
    const admission = await admitRegistryPaymentRequiredItem(timezoneFixture.paymentRequired)
    const item = admission.admitted[0]
    expect(item).toBeDefined()
    if (item === undefined) throw new Error('expected registry graduation admission')

    await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [item],
      complete: false,
      deadlineAt,
    })
    const refresh = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [],
      complete: true,
      seenPublicationRefs: [],
      deadlineAt,
    })

    expect(refresh.withdrawn).toBe(0)
    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityPublications').unique()))
      .resolves.toMatchObject({
        disposition: 'current',
        sourceRevision: expect.stringMatching(/^registry-graduation:/u),
      })
  })

  it('reports admission and reconciliation skips in the action total', async () => {
    const backend = convexTest(schema, convexModules)
    const response = new Response(JSON.stringify({
      items: [timezoneFixture.paymentRequired, { malformed: true }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
    vi.stubGlobal('fetch', vi.fn(async () => response.clone()))
    try {
      await expect(backend.action(internal.facilitatorDiscoveryAction.run, {})).resolves.toEqual({
        pages: 2,
        admitted: 2,
        skipped: 3,
        complete: true,
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not create a business for malformed input or withdraw on a partial run', async () => {
    const backend = convexTest(schema, convexModules)
    const admission = await admitFacilitatorDiscoveryItems([{ malformed: true }])
    expect(admission.admitted).toHaveLength(0)
    const result = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [...admission.admitted],
      complete: false,
      deadlineAt: Date.now() + 60_000,
    })
    expect(result).toMatchObject({ admitted: 0, published: 0, withdrawn: 0 })
    await expect(backend.run(async (ctx) => await ctx.db.query('businesses').collect())).resolves.toHaveLength(0)
  })

  it('performs no writes when the reconciliation deadline has expired', async () => {
    const backend = convexTest(schema, convexModules)
    const admission = await admitFacilitatorDiscoveryItems([timezoneFixture.paymentRequired])
    const item = admission.admitted[0]
    expect(item).toBeDefined()
    if (item === undefined) throw new Error('expected recorded discovery admission')

    const result = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [item],
      complete: true,
      seenPublicationRefs: [],
      deadlineAt: 0,
    })

    expect(result).toMatchObject({
      published: 0,
      withdrawn: 0,
      deadlineExceeded: true,
    })
    await expect(backend.run(async (ctx) => ({
      businesses: await ctx.db.query('businesses').collect(),
      owners: await ctx.db.query('owners').collect(),
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      publications: await ctx.db.query('capabilityPublications').collect(),
    }))).resolves.toMatchObject({
      businesses: [],
      owners: [],
      connections: [],
      publications: [],
    })
  })

  it('rejects structural reconciliation limits before any writes', async () => {
    const backend = convexTest(schema, convexModules)
    const deadlineAt = Date.now() + 60_000
    const admission = await admitFacilitatorDiscoveryItems([timezoneFixture.paymentRequired])
    const item = admission.admitted[0]
    expect(item).toBeDefined()
    if (item === undefined) throw new Error('expected recorded discovery admission')

    await expect(backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: Array.from({ length: 101 }, () => item),
      complete: false,
      deadlineAt,
    })).rejects.toThrow('facilitator_discovery_batch_invalid')

    await expect(backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [{ ...item, sourceImportJson: 'x'.repeat(262_144) }],
      complete: false,
      deadlineAt,
    })).rejects.toThrow('facilitator_discovery_batch_invalid')

    await expect(backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [],
      complete: true,
      seenPublicationRefs: Array.from({ length: 2_001 }, (_, index) => `ref-${index}`),
      deadlineAt,
    })).rejects.toThrow('facilitator_discovery_batch_invalid')

    await expect(backend.run(async (ctx) => ({
      businesses: await ctx.db.query('businesses').collect(),
      owners: await ctx.db.query('owners').collect(),
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      publications: await ctx.db.query('capabilityPublications').collect(),
    }))).resolves.toMatchObject({
      businesses: [],
      owners: [],
      connections: [],
      publications: [],
    })
  })
})
