import { v } from 'convex/values'

import { internalMutation } from './_generated/server'
import { seedLabelledComparisonOfferingCommand } from './catalog'
import { registerSandboxBusinesses } from './devSeed'
import { runtimeDb } from './source_state'
import type { RuntimeDocument } from './source_state'
import type { OfferingRef } from '../src/modules/common/ids'
import { DEV_SEED_BUSINESS_FIXTURES } from '../src/modules/dev/public'

const seedVersion = 'phase5-consumer-comparison:2026-07-23:v1'
const projectionControlKey = 'offering_public_projection_enabled'
const observedAt = Date.parse('2026-07-23T00:00:00.000Z')
const demoSlugs = [
  'sandbox-phase5-web-starter',
  'sandbox-phase5-web-growth',
  'sandbox-phase5-data-rest',
  'sandbox-phase5-data-graphql',
] as const

const demoSelection = v.object({
  businessId: v.string(),
  offeringRef: v.string(),
  revision: v.number(),
  projectionObservedAt: v.number(),
  profileVersion: v.union(
    v.literal('professional_service:v1'),
    v.literal('machine_data:v1'),
  ),
})

const known = <T>(value: T) => ({
  kind: 'known' as const,
  value,
  source: { kind: 'business_supplied' as const },
  observedAt,
})

const demoOfferings = [
  {
    slug: 'sandbox-phase5-web-starter',
    key: 'website-starter',
    name: 'Labelled demo website starter',
    category: 'Website development',
    summary: 'A labelled demonstration of a small-business website delivery option.',
    serviceAreaSummary: 'Perth and remote',
    availabilitySummary: 'Demo facts only; no service is supplied.',
    pricingSummary: 'Demo fixed scope from AUD 850.',
    comparison: {
      schemaVersion: 'offering-comparison:v1' as const,
      profile: {
        profileId: 'professional_service:v1' as const,
        scopeBasis: known('Five-page website, contact form, and launch handover'),
        priceBasis: known({
          description: 'Labelled demo fixed scope',
          currency: 'AUD',
          amountMinor: 85_000,
          unit: 'total' as const,
        }),
        timingBasis: known('About three weeks after content is ready'),
        serviceArea: known('Perth and remote'),
      },
    },
  },
  {
    slug: 'sandbox-phase5-web-growth',
    key: 'website-growth',
    name: 'Labelled demo website growth package',
    category: 'Website development',
    summary: 'A labelled demonstration of a broader website delivery option.',
    serviceAreaSummary: 'Perth and remote',
    availabilitySummary: 'Demo facts only; no service is supplied.',
    pricingSummary: 'Demo fixed scope from AUD 1,250.',
    comparison: {
      schemaVersion: 'offering-comparison:v1' as const,
      profile: {
        profileId: 'professional_service:v1' as const,
        scopeBasis: known('Eight-page website, enquiry flow, analytics setup, and launch handover'),
        priceBasis: known({
          description: 'Labelled demo fixed scope',
          currency: 'AUD',
          amountMinor: 125_000,
          unit: 'total' as const,
        }),
        timingBasis: known('About five weeks after content is ready'),
        serviceArea: known('Perth and remote'),
      },
    },
  },
  {
    slug: 'sandbox-phase5-data-rest',
    key: 'market-data-rest',
    name: 'Labelled demo market data REST feed',
    category: 'Machine-readable data',
    summary: 'A labelled demonstration of a request-priced JSON data feed.',
    serviceAreaSummary: 'Online',
    availabilitySummary: 'Demo facts only; no endpoint is contacted.',
    pricingSummary: 'Demo rate AUD 0.01 per request.',
    comparison: {
      schemaVersion: 'offering-comparison:v1' as const,
      profile: {
        profileId: 'machine_data:v1' as const,
        interfaceFormat: known('rest_json' as const),
        requestMethod: known('GET' as const),
        authentication: known('api_key' as const),
        priceBasis: known({
          description: 'Labelled demo request price',
          currency: 'AUD',
          amountMinor: 1,
          unit: 'request' as const,
        }),
        freshnessOrUpdateCadence: known('Updated every minute'),
      },
    },
  },
  {
    slug: 'sandbox-phase5-data-graphql',
    key: 'market-data-graphql',
    name: 'Labelled demo market data GraphQL feed',
    category: 'Machine-readable data',
    summary: 'A labelled demonstration of a GraphQL data feed with no authentication.',
    serviceAreaSummary: 'Online',
    availabilitySummary: 'Demo facts only; no endpoint is contacted.',
    pricingSummary: 'Demo rate AUD 0.02 per request.',
    comparison: {
      schemaVersion: 'offering-comparison:v1' as const,
      profile: {
        profileId: 'machine_data:v1' as const,
        interfaceFormat: known('graphql' as const),
        requestMethod: known('POST' as const),
        authentication: known('none' as const),
        priceBasis: known({
          description: 'Labelled demo request price',
          currency: 'AUD',
          amountMinor: 2,
          unit: 'request' as const,
        }),
        freshnessOrUpdateCadence: known('Updated every five minutes'),
      },
    },
  },
] as const

/**
 * Creates only the four inert business identities needed by the Phase 5 proof.
 * Capability registration, binding, publication, readiness, and retirement are
 * intentionally outside this boundary.
 */
export const bootstrapLabelledConsumerComparisonBusinesses = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('bootstrapped'),
    dataLabel: v.literal('labelled_demo'),
    seededSlugs: v.array(v.string()),
    businessIdsBySlug: v.record(v.string(), v.string()),
    createdCount: v.number(),
  }),
  handler: async (ctx) => {
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
      demoSlugs.includes(fixture.requestedSlug as typeof demoSlugs[number])
    ))
    if (fixtures.length !== demoSlugs.length) {
      throw new Error('consumer_comparison_demo_fixture_set_incomplete')
    }

    const existing = await Promise.all(fixtures.map(async (fixture) => (
      ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', fixture.requestedSlug))
        .unique()
    )))
    for (const [index, fixture] of fixtures.entries()) {
      const business = existing[index]
      if (business !== undefined && business !== null && (
        business.name !== fixture.businessName
        || business.category !== fixture.category
        || business.claimStatus !== 'published'
        || business.publicStatus !== 'published'
      )) {
        throw new Error(`consumer_comparison_demo_business_identity_mismatch:${fixture.requestedSlug}`)
      }
    }

    const missingFixtures = fixtures.filter((_, index) => existing[index] === null)
    const created = await registerSandboxBusinesses(
      runtimeDb(ctx.db),
      missingFixtures,
      observedAt,
    )
    const businessIdsBySlug = {
      ...Object.fromEntries(fixtures.flatMap((fixture, index) => {
        const business = existing[index]
        return business === undefined || business === null
          ? []
          : [[fixture.requestedSlug, business._id]]
      })),
      ...created.businessIdsBySlug,
    }

    return {
      kind: 'bootstrapped' as const,
      dataLabel: 'labelled_demo' as const,
      seededSlugs: [...demoSlugs],
      businessIdsBySlug,
      createdCount: missingFixtures.length,
    }
  },
})

/**
 * Release-only labelled inventory for the public, inspect-only Phase 5 proof.
 * It accepts no caller-selected business, offering, price, or route material.
 */
export const seedLabelledConsumerComparisonDemo = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('seeded'),
    dataLabel: v.literal('labelled_demo'),
    seedVersion: v.string(),
    selections: v.array(demoSelection),
    detailUrls: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const db = runtimeDb(ctx.db)
    const projectionControl = await db.query('operatorControls')
      .withIndex('by_key', (query) => query.eq('key', projectionControlKey))
      .unique()
    if (projectionControl?.enabled !== true) {
      throw new Error('consumer_comparison_demo_public_projection_disabled')
    }

    const selections = []
    const detailUrls = []
    for (const definition of demoOfferings) {
      const business = await db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', definition.slug))
        .unique()
      if (
        business === null
        || stringField(business, 'publicStatus') !== 'published'
        || stringField(business, 'claimStatus') !== 'published'
      ) {
        throw new Error(`consumer_comparison_demo_business_unavailable:${definition.slug}`)
      }

      const offeringRef = `offering:phase5-demo:${definition.key}:v1`
      const seeded = await seedLabelledComparisonOfferingCommand(db, {
        businessId: business._id,
        offeringRef: offeringRef as OfferingRef,
        operationKeyPrefix: `release:${seedVersion}:${definition.key}`,
        facts: {
          name: definition.name,
          category: definition.category,
          summary: definition.summary,
          serviceAreaSummary: definition.serviceAreaSummary,
          availabilitySummary: definition.availabilitySummary,
          pricingSummary: definition.pricingSummary,
          comparison: definition.comparison,
        },
      }, observedAt)
      if (seeded.kind !== 'ok') {
        throw new Error(`consumer_comparison_demo_${seeded.code}:${offeringRef}`)
      }

      selections.push({
        businessId: business._id,
        offeringRef,
        revision: 1,
        projectionObservedAt: seeded.projectionObservedAt,
        profileVersion: definition.comparison.profile.profileId,
      })
      detailUrls.push(`/${definition.slug}/offerings/${encodeURIComponent(offeringRef)}`)
    }

    return {
      kind: 'seeded' as const,
      dataLabel: 'labelled_demo' as const,
      seedVersion,
      selections,
      detailUrls,
    }
  },
})

function stringField(row: RuntimeDocument, key: string): string {
  return typeof row[key] === 'string' ? row[key] as string : ''
}
