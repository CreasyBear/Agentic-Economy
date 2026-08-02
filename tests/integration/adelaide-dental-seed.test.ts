import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { readPublicOfferingRegistrySearchPage } from '@/modules/registry/registry.functions'
import type { OfferingPrice } from '@/modules/catalog/public'
import { resolveCheckupQuote } from '@/modules/sandbox-supply/public'

import { convexModules as modules } from '../helpers/convex-fixtures'

type SeedBackend = TestConvex<typeof schema>

const ASK = 'My tooth hurts and I need a dentist near Adelaide this week'

const runOfferingCutover = async (backend: SeedBackend): Promise<void> => {
  let cursor: string | null = null
  for (let page = 0; page < 40; page += 1) {
    const step: { errors: readonly string[]; done: boolean; nextCursor: string | null } =
      await backend.mutation(internal.devSeed.seedOfferingSupply, { cursor })
    expect(step.errors).toEqual([])
    if (step.done) return
    cursor = step.nextCursor
  }
  throw new Error('dev seed offering cutover did not finish')
}

describe('canonical Adelaide dental seed', () => {
  it('seeds the canonical offering and quotes the discovered slug', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})

    const seeded = await backend.query(api.registry.searchPublicBusinessOfferingSupply, {
      query: ASK,
      limit: 20,
    }) as { items: readonly { slug: string }[] }
    expect(seeded.items.map((item) => item.slug)).toContain('adelaide-dental-clinic')
    const seededDetail = await backend.query(api.registry.getPublicBusinessOfferingSupplyBySlug, {
      slug: 'adelaide-dental-clinic',
    }) as {
      kind: string
      business?: {
        offerings: readonly {
          name: string
          serviceAreaSummary?: string
          availabilitySummary?: string
          pricingSummary?: string
          price?: OfferingPrice
          accessPaths: readonly { kind: string; url?: string; method?: string }[]
        }[]
      }
    }
    expect(seededDetail.kind).toBe('found')
    if (seededDetail.kind !== 'found' || seededDetail.business === undefined) return
    expect(seededDetail.business.offerings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'General dental care',
        serviceAreaSummary: 'Adelaide and nearby suburbs',
        availabilitySummary: 'Mon–Fri 8:30am–5pm',
        pricingSummary: 'Demo price — $95 check-up and clean',
        price: { kind: 'fixed', currency: 'AUD', amountMinor: 9_500, unit: 'visit', taxTreatment: 'inclusive' },
        accessPaths: expect.arrayContaining([
          expect.objectContaining({
            kind: 'external_operation',
            method: 'POST',
            url: expect.stringContaining('/api/sandbox/adelaide-dental-clinic/checkup-quote'),
          }),
        ]),
      }),
    ]))
    const seededQuote = resolveCheckupQuote({
      slug: 'adelaide-dental-clinic',
      requestedAt: Date.parse('2026-07-31T09:00:00.000Z'),
      offerings: seededDetail.business.offerings,
    })
    expect(seededQuote).toMatchObject({
      kind: 'ok',
      code: 'quoted',
      quote: {
        price: { currency: 'AUD', amountMinor: 9_500, unit: 'visit', taxTreatment: 'inclusive' },
      },
    })
    const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    try {
      const localSearch = await readPublicOfferingRegistrySearchPage({ query: ASK, limit: 20 })
      expect(localSearch.items.map((item) => item.slug)).toContain('adelaide-dental-clinic')

    } finally {
      if (previousBypass === undefined) delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      else process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousBypass
      if (previousConvexUrl === undefined) delete process.env.CONVEX_URL
      else process.env.CONVEX_URL = previousConvexUrl
      if (previousPublicConvexUrl === undefined) delete process.env.VITE_CONVEX_URL
      else process.env.VITE_CONVEX_URL = previousPublicConvexUrl
    }
  }, 300_000)
  it('keeps an explicit Adelaide request local while broad and unknown searches stay honest', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})

    const scoped = await backend.query(api.registry.searchPublicBusinessOfferingSupply, {
      query: ASK,
      limit: 20,
    }) as {
      items: readonly {
        slug: string
        suburb: string
        offerings: readonly { serviceAreaSummary?: string }[]
      }[]
    }
    expect(scoped.items.length).toBeGreaterThan(0)
    expect(scoped.items.every((item) => item.suburb === 'Adelaide'
      || item.offerings.some((offering) => offering.serviceAreaSummary?.toLowerCase().includes('adelaide') === true))).toBe(true)

    const broad = await backend.query(api.registry.searchPublicBusinessOfferingSupply, {
      query: 'dentist',
      limit: 20,
    }) as { items: readonly { suburb: string }[] }
    expect(new Set(broad.items.map((item) => item.suburb)).size).toBeGreaterThan(1)

    const unknown = await backend.query(api.registry.searchPublicBusinessOfferingSupply, {
      query: 'dentist near Moonah',
      limit: 20,
    }) as { items: readonly unknown[] }
    expect(unknown.items).toEqual([])
  }, 300_000)

  it('re-seeds without duplicating the canonical records', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)

    const counts = await backend.run(async (ctx) => {
      const businesses = await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', 'adelaide-dental-clinic'))
        .take(10)
      const business = businesses[0]
      return {
        businesses: businesses.length,
        offerings: business === undefined
          ? 0
          : (await ctx.db.query('businessOfferings')
              .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business._id))
              .take(10)).length,
        revisions: business === undefined
          ? 0
          : (await ctx.db.query('businessOfferingRevisions')
              .withIndex('by_businessId_and_createdAt', (query) => query.eq('businessId', business._id))
              .take(10)).length,
        accessPaths: (await ctx.db.query('offeringAccessPaths')
          .withIndex('by_accessPathRef', (query) => query.eq(
            'accessPathRef',
            'access:adelaide-dental-clinic:callable',
          ))
          .take(10)).length,
      }
    })
    expect(counts).toEqual({ businesses: 1, offerings: 1, revisions: 2, accessPaths: 1 })
  }, 300_000)
})
