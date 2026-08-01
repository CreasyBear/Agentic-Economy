import { afterEach, describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  filterPublicRegistryDetail,
  filterPublicRegistryPage,
  readPublicOfferingRegistrySearchPage,
  setCatalogSearchBackendForTests,
  setCatalogSearchPortForTests,
} from '@/modules/registry/registry.functions'
import type { CatalogSearchPort } from '@/modules/registry/internal/catalog-search-port'
import type { PublicBusinessCatalogApiDto, PublicBusinessCatalogApiPage } from '@/modules/registry/public'
import {
  searchPublicBusinessCatalog as convexSearchPublicBusinessCatalog,
  searchPublicBusinessOfferingSupply as convexSearchPublicBusinessOfferingSupply,
  setRegistrySearchFallbackMetricSinkForTests,
  type RegistrySearchFallbackMetric,
} from '../../../convex/registry'


type ConvexRegistryRow = Record<string, unknown> & { _id: string; _creationTime: number }
type ConvexRegistryFilter =
  | { op: 'eq'; field: string; value: unknown }
  | { op: 'gte'; field: string; value: unknown }
  | { op: 'search'; field: string; value: string }
type ConvexRegistryIndexBuilder = {
  eq: (field: string, value: unknown) => ConvexRegistryIndexBuilder
  gte: (field: string, value: unknown) => ConvexRegistryIndexBuilder
  search: (field: string, value: string) => ConvexRegistryIndexBuilder
}
type ConvexRegistryQuery = {
  withIndex: (indexName: string, callback: (query: ConvexRegistryIndexBuilder) => ConvexRegistryIndexBuilder) => ConvexRegistryQuery
  withSearchIndex: (indexName: string, callback: (query: ConvexRegistryIndexBuilder) => ConvexRegistryIndexBuilder) => ConvexRegistryQuery
  collect: () => Promise<ConvexRegistryRow[]>
  first: () => Promise<ConvexRegistryRow | null>
  take: (limit: number) => Promise<ConvexRegistryRow[]>
  unique: () => Promise<ConvexRegistryRow | null>
}
type ConvexRegistryDb = {
  query: (tableName: string) => ConvexRegistryQuery
  get: (id: string) => Promise<ConvexRegistryRow | null>
}
type ConvexRegistryQueryCtx = { db: ConvexRegistryDb }
type ConvexSearchHandler = (
  ctx: ConvexRegistryQueryCtx,
  args: { query: string; limit?: number },
) => Promise<unknown>
type ConvexRegisteredSearch = { _handler: ConvexSearchHandler }
type ConvexOfferingSearchArgs = {
  query: string
  mode?: 'near_me' | 'whole_catalogue'
  location?: string
  maxPriceMinor?: number
  hasPrice?: boolean
  cursor?: string
  limit?: number
}
type ConvexOfferingSearchPage = {
  kind: string
  items: readonly { slug: string }[]
  pagination: { total: number; limit: number; hasMore: boolean }
}
type ConvexRegisteredOfferingSearch = {
  _handler: (ctx: ConvexRegistryQueryCtx, args: ConvexOfferingSearchArgs) => Promise<ConvexOfferingSearchPage>
}

// Convex registered functions expose _handler in this unit-test seam.
const registeredConvexSearch = convexSearchPublicBusinessCatalog as unknown as ConvexRegisteredSearch
const convexSearchHandler = registeredConvexSearch._handler
const convexOfferingSearchHandler =
  (convexSearchPublicBusinessOfferingSupply as unknown as ConvexRegisteredOfferingSearch)._handler

describe('registry convex fallback', () => {
  afterEach(() => {
    setCatalogSearchBackendForTests(undefined)
    setCatalogSearchPortForTests(undefined)
  })

  it('fails loudly when Convex registry queries lack a source URL and the explicit local e2e bypass is unset', async () => {
    const previousConvexUrl = process.env.CONVEX_URL
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    const previousLocalBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E

    try {
      await expect(
        readPublicOfferingRegistrySearchPage({
          query: 'emergency plumber parramatta',
          limit: 10,
        }),
      ).rejects.toThrow('registry_source_query_failed')
    } finally {
      restoreEnv('CONVEX_URL', previousConvexUrl)
      restoreEnv('VITE_CONVEX_URL', previousViteConvexUrl)
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalBypass)
    }
  })

  it('does not hide a configured Convex outage behind the auth bypass fixture', async () => {
    const previousConvexUrl = process.env.CONVEX_URL
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    const previousLocalBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    delete process.env.CONVEX_URL
    process.env.VITE_CONVEX_URL = 'http://127.0.0.1:1'
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      await expect(readPublicOfferingRegistrySearchPage({
        query: 'dentist Adelaide',
        limit: 10,
      })).rejects.toThrow('registry_source_query_failed')
    } finally {
      restoreEnv('CONVEX_URL', previousConvexUrl)
      restoreEnv('VITE_CONVEX_URL', previousViteConvexUrl)
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalBypass)
    }
  })
  it('preserves the original Convex/source failure as the loud error cause', async () => {
    const previousConvexUrl = process.env.CONVEX_URL
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    const previousLocalBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E

    try {
      await readPublicOfferingRegistrySearchPage({
        query: 'Emergency plumber Brunswick',
        limit: 10,
      })
      throw new Error('Expected registry source query to fail without local e2e bypass.')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({ message: 'registry_source_query_failed' })
      expect((error as Error & { cause?: unknown }).cause).toMatchObject({
        code: 'missing_convex_url',
      })
    } finally {
      restoreEnv('CONVEX_URL', previousConvexUrl)
      restoreEnv('VITE_CONVEX_URL', previousViteConvexUrl)
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalBypass)
    }
  })

  it('exposes an inquiry-ready listing only in the local e2e registry bypass', async () => {
    const previous = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const demoPage = await readPublicOfferingRegistrySearchPage({
        query: 'diagnostic plumbing parramatta',
        limit: 10,
      })
      expect(demoPage.items.map((item) => item.slug)).toEqual([
        'plumbing-demo',
        'parramatta-emergency-plumbing',
      ])
      expect(demoPage.items[0]?.offerings[0]?.accessPaths.some(
        (path) => path.kind === 'human_request' && path.channel === 'ae_inquiry',
      )).toBe(true)

      const genericPage = await readPublicOfferingRegistrySearchPage({
        query: 'emergency plumber parramatta',
        limit: 10,
      })
      expect(genericPage.items.map((item) => item.slug)).toEqual([
        'plumbing-demo',
        'parramatta-emergency-plumbing',
      ])
      restoreEnv('VITE_CONVEX_URL', previousViteConvexUrl)
    } finally {
      if (previous === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previous
      }
    }
  })

  it('hydrates Meili-ranked candidates from the explicit local e2e catalog before returning them', async () => {
    const previousLocalBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    setCatalogSearchBackendForTests('meilisearch')
    setCatalogSearchPortForTests(fakeCatalogSearchPort({
      search: async () => ({
        kind: 'ok',
        backend: 'meilisearch',
        query: 'emergency plumber parramatta',
        estimatedTotalHits: 1,
        hits: [
          {
            documentId: 'parramatta-emergency-plumbing__emergency-pipe-repair',
            businessSlug: 'parramatta-emergency-plumbing',
            serviceSlug: 'emergency-pipe-repair',
            generatedHash: brandNonEmpty('hash:generated:parramatta', 'SourceHash'),
            rank: 1,
          },
        ],
      }),
    }))

    try {
      const page = await readPublicOfferingRegistrySearchPage({
        query: 'emergency plumber parramatta',
        limit: 10,
      })

      expect(page.items.map((item) => item.slug)).toEqual(['parramatta-emergency-plumbing'])
      expect(JSON.stringify(page)).not.toMatch(/serviceId|sourceHash|private:evidence/)
      restoreEnv('VITE_CONVEX_URL', previousViteConvexUrl)
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalBypass)
    }
  })

  it('falls back to the explicit local e2e source when Meili is unavailable', async () => {
    const previousLocalBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    setCatalogSearchBackendForTests('meilisearch')
    setCatalogSearchPortForTests(fakeCatalogSearchPort({
      search: async () => {
        throw new Error('meili unavailable')
      },
    }))

    try {
      const page = await readPublicOfferingRegistrySearchPage({
        query: 'emergency plumber parramatta',
        limit: 10,
      })

      expect(page.items.map((item) => item.slug)).toEqual([
        'plumbing-demo',
        'parramatta-emergency-plumbing',
      ])
      expect(page).toMatchObject({
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        pagination: { total: 2, hasMore: false },
      })
      restoreEnv('VITE_CONVEX_URL', previousViteConvexUrl)
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalBypass)
    }
  })

  it('falls back to the explicit local e2e source when Meili answers a real query with zero hits', async () => {
    const previousLocalBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    setCatalogSearchBackendForTests('meilisearch')
    setCatalogSearchPortForTests(fakeCatalogSearchPort({
      search: async () => ({
        kind: 'ok',
        backend: 'meilisearch',
        query: 'emergency plumber parramatta',
        estimatedTotalHits: 0,
        hits: [],
      }),
    }))

    try {
      const page = await readPublicOfferingRegistrySearchPage({
        query: 'emergency plumber parramatta',
        limit: 10,
      })

      expect(page.items.map((item) => item.slug)).toEqual([
        'plumbing-demo',
        'parramatta-emergency-plumbing',
      ])
      expect(page).toMatchObject({
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        pagination: { total: 2, hasMore: false },
      })
      restoreEnv('VITE_CONVEX_URL', previousViteConvexUrl)
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalBypass)
    }
  })

  it('keeps a non-empty Meili hit set as the answer without a second source search', async () => {
    const previousLocalBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    let searchCalls = 0
    setCatalogSearchBackendForTests('meilisearch')
    setCatalogSearchPortForTests(fakeCatalogSearchPort({
      search: async () => {
        searchCalls += 1
        return {
          kind: 'ok',
          backend: 'meilisearch',
          query: 'emergency plumber parramatta',
          estimatedTotalHits: 1,
          hits: [
            {
              documentId: 'parramatta-emergency-plumbing__emergency-pipe-repair',
              businessSlug: 'parramatta-emergency-plumbing',
              serviceSlug: 'emergency-pipe-repair',
              generatedHash: brandNonEmpty('hash:generated:parramatta', 'SourceHash'),
              rank: 1,
            },
          ],
        }
      },
    }))

    try {
      const page = await readPublicOfferingRegistrySearchPage({
        query: 'emergency plumber parramatta',
        limit: 10,
      })

      expect(searchCalls).toBe(1)
      // The source search would also return plumbing-demo, so a single ranked slug
      // proves the hydration path answered without a fallback source read.
      expect(page.items.map((item) => item.slug)).toEqual(['parramatta-emergency-plumbing'])
      expect(page).toMatchObject({ pagination: { total: 1 } })
      restoreEnv('VITE_CONVEX_URL', previousViteConvexUrl)
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalBypass)
    }
  })

  it('keeps AE smoke validation rows out of public registry reads', async () => {
    const smoke = businessDto({
      slug: 'agentic-economy-r10-smoke',
      name: 'Agentic Economy R10 Smoke',
      services: [
        serviceDto({
          slug: 'r10-emergency-triage-readback',
          name: 'R10 emergency triage readback',
          summary: 'Smoke readback for public registry routes.',
        }),
      ],
    })
    const real = businessDto()
    await expect(filterPublicRegistryPage(Promise.resolve(pageDto([smoke, real])))).resolves.toMatchObject({
      items: [{ slug: 'parramatta-emergency-plumbing' }],
      pagination: { total: 1 },
    })
    await expect(
      filterPublicRegistryPage(Promise.resolve(pageDto([smoke, real], 'emergency plumber parramatta'))),
    ).resolves.toMatchObject({
      items: [{ slug: 'parramatta-emergency-plumbing' }],
      pagination: { total: 1 },
    })
    await expect(
      filterPublicRegistryDetail(Promise.resolve({
        kind: 'found',
        schemaVersion: 'public-business-catalog-api:v1',
        business: smoke,
      })),
    ).resolves.toEqual({
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No public business catalog exists for this slug.',
    })
  })

  it('uses registrySearchDocuments for seeded catalog search without falling back to the business scan', async () => {
    const db = new ConvexRegistryFakeDb()
    const metrics: RegistrySearchFallbackMetric[] = []
    const resetMetricSink = setRegistrySearchFallbackMetricSinkForTests((metric) => {
      metrics.push(metric)
    })
    seedConvexRegistryCatalog(db)
    seedConvexRegistrySearchDocument(db)

    try {
      const page = await convexSearchHandler(
        { db },
        { query: 'emergency plumber in parramatta', limit: 10 },
      )

      expect(page).toMatchObject({
        kind: 'ok',
        items: [{ slug: 'parramatta-emergency-plumbing' }],
      })
      expect(metrics).toEqual([])
    } finally {
      resetMetricSink()
    }
  })
})

/**
 * A budget filter that hides quoted-on-request supply would remove most real
 * local businesses while looking like it removed expensive ones. These pin the
 * distinction between "priced above the budget" and "no comparable price".
 */
describe('registry offering supply price filter', () => {
  const searchPricedSupply = async (
    args: Omit<ConvexOfferingSearchArgs, 'query'>,
  ): Promise<readonly string[]> => {
    const db = new ConvexRegistryFakeDb()
    seedConvexOfferingPriceSupply(db)
    const page = await convexOfferingSearchHandler({ db }, { query: 'plumbing', ...args })
    return page.items.map((item) => item.slug)
  }

  it('returns every matching business when no price filter is supplied', async () => {
    expect(await searchPricedSupply({})).toEqual([
      'budget-plumbing',
      'premium-plumbing',
      'quoted-plumbing',
      'unpriced-plumbing',
    ])
  })

  it('drops supply priced above the budget and keeps supply quoted on request', async () => {
    expect(await searchPricedSupply({ maxPriceMinor: 20_000 })).toEqual([
      'budget-plumbing',
      'quoted-plumbing',
      'unpriced-plumbing',
    ])
  })

  it('compares a range against its upper bound, not its starting price', async () => {
    // premium-plumbing is a 30000-90000 range: its floor fits a $500 budget,
    // but the job could cost $900, so the budget must not promise it.
    expect(await searchPricedSupply({ maxPriceMinor: 50_000 })).toEqual([
      'budget-plumbing',
      'quoted-plumbing',
      'unpriced-plumbing',
    ])
    expect(await searchPricedSupply({ maxPriceMinor: 90_000 })).toContain('premium-plumbing')
  })

  it('keeps a business when any one of its offerings fits the budget', async () => {
    expect(await searchPricedSupply({ maxPriceMinor: 12_000 })).toEqual([
      'budget-plumbing',
      'quoted-plumbing',
      'unpriced-plumbing',
    ])
  })

  it('narrows to published comparable prices only when hasPrice is true', async () => {
    expect(await searchPricedSupply({ hasPrice: true })).toEqual([
      'budget-plumbing',
      'premium-plumbing',
      'quoted-plumbing',
    ])
    expect(await searchPricedSupply({ hasPrice: false })).toHaveLength(4)
  })

  it('combines both filters and reports the narrowed total', async () => {
    const db = new ConvexRegistryFakeDb()
    seedConvexOfferingPriceSupply(db)

    const page = await convexOfferingSearchHandler(
      { db },
      { query: 'plumbing', maxPriceMinor: 20_000, hasPrice: true },
    )

    expect(page.items.map((item) => item.slug)).toEqual(['budget-plumbing', 'quoted-plumbing'])
    expect(page.pagination).toMatchObject({ total: 2, hasMore: false })
  })

  it('ignores a budget that is not a whole positive number of minor units', async () => {
    expect(await searchPricedSupply({ maxPriceMinor: 0 })).toHaveLength(4)
    expect(await searchPricedSupply({ maxPriceMinor: -1 })).toHaveLength(4)
    expect(await searchPricedSupply({ maxPriceMinor: 12_000.5 })).toHaveLength(4)
  })
})

class ConvexRegistryFakeIndexBuilder implements ConvexRegistryIndexBuilder {
  readonly filters: ConvexRegistryFilter[] = []

  eq(field: string, value: unknown): ConvexRegistryIndexBuilder {
    this.filters.push({ op: 'eq', field, value })
    return this
  }

  gte(field: string, value: unknown): ConvexRegistryIndexBuilder {
    this.filters.push({ op: 'gte', field, value })
    return this
  }

  search(field: string, value: string): ConvexRegistryIndexBuilder {
    this.filters.push({ op: 'search', field, value })
    return this
  }
}

class ConvexRegistryFakeQuery implements ConvexRegistryQuery {
  constructor(
    private readonly db: ConvexRegistryFakeDb,
    private readonly tableName: string,
    private readonly filters: readonly ConvexRegistryFilter[] = [],
  ) {}

  withIndex(_indexName: string, callback: (query: ConvexRegistryIndexBuilder) => ConvexRegistryIndexBuilder): ConvexRegistryQuery {
    const builder = new ConvexRegistryFakeIndexBuilder()
    callback(builder)
    return new ConvexRegistryFakeQuery(this.db, this.tableName, builder.filters)
  }

  withSearchIndex(_indexName: string, callback: (query: ConvexRegistryIndexBuilder) => ConvexRegistryIndexBuilder): ConvexRegistryQuery {
    const builder = new ConvexRegistryFakeIndexBuilder()
    callback(builder)
    return new ConvexRegistryFakeQuery(this.db, this.tableName, builder.filters)
  }

  async collect(): Promise<ConvexRegistryRow[]> {
    return this.apply()
  }

  async first(): Promise<ConvexRegistryRow | null> {
    return this.apply().at(0) ?? null
  }

  async take(limit: number): Promise<ConvexRegistryRow[]> {
    return this.apply().slice(0, limit)
  }

  async unique(): Promise<ConvexRegistryRow | null> {
    return this.apply().at(0) ?? null
  }

  private apply(): ConvexRegistryRow[] {
    return this.db
      .table(this.tableName)
      .filter((row) => this.filters.every((filter) => matchesConvexRegistryFilter(row, filter)))
      .sort((left, right) => String(left.slug ?? '').localeCompare(String(right.slug ?? '')))
  }
}

class ConvexRegistryFakeDb implements ConvexRegistryDb {
  private readonly tables: Record<string, ConvexRegistryRow[]> = {}

  query(tableName: string): ConvexRegistryQuery {
    return new ConvexRegistryFakeQuery(this, tableName)
  }

  async get(id: string): Promise<ConvexRegistryRow | null> {
    return Object.values(this.tables)
      .flat()
      .find((row) => row._id === id) ?? null
  }

  seed(tableName: string, row: ConvexRegistryRow): void {
    this.table(tableName).push(row)
  }

  table(tableName: string): ConvexRegistryRow[] {
    this.tables[tableName] ??= []
    return this.tables[tableName]
  }
}

function seedConvexRegistryCatalog(db: ConvexRegistryFakeDb): void {
  db.seed('businesses', {
    _id: 'businesses:1',
    _creationTime: 1,
    ownerId: 'owners:1',
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    normalizedName: 'parramatta emergency plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'claimed',
    claimStatus: 'published',
    sourceHash: 'hash:business:1',
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('businessContexts', {
    _id: 'businessContexts:1',
    _creationTime: 2,
    businessId: 'businesses:1',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    sourceRefs: [],
    sourceHash: 'hash:business:1',
    approvedAt: 2,
  })
  db.seed('businessServices', {
    _id: 'businessServices:1',
    _creationTime: 3,
    businessId: 'businesses:1',
    serviceSlug: 'emergency-pipe-repair',
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Emergency plumbing help for urgent pipe repairs.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Owner supplied hours',
    status: 'published',
    sortOrder: 0,
    sourceHash: 'hash:service:1',
    createdAt: 3,
    updatedAt: 3,
  })
  db.seed('serviceCapabilities', {
    _id: 'serviceCapabilities:1',
    _creationTime: 4,
    businessId: 'businesses:1',
    serviceId: 'businessServices:1',
    kind: 'quote_request',
    status: 'available',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Send a qualified inquiry for owner review.',
    publicChannel: 'public_business_contact',
    callable: false,
    paymentRequired: false,
    sourceHash: 'hash:capability:1',
    createdAt: 4,
    updatedAt: 4,
  })
}

function seedConvexRegistrySearchDocument(db: ConvexRegistryFakeDb): void {
  db.seed('registrySearchDocuments', {
    _id: 'registrySearchDocuments:1',
    _creationTime: 5,
    documentId: 'parramatta-emergency-plumbing__emergency-pipe-repair',
    schemaVersion: 'registry-search-document:v1',
    businessSlug: 'parramatta-emergency-plumbing',
    serviceSlug: 'emergency-pipe-repair',
    businessName: 'Parramatta Emergency Plumbing',
    serviceName: 'Emergency pipe repair',
    serviceCategory: 'Emergency plumbing',
    serviceCategoryKey: 'emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'claimed',
    firstRequestMode: 'inquiry_available',
    placeKeys: ['parramatta', 'parramatta nsw', 'nsw'],
    serviceKeywords: ['plumber', 'urgent'],
    searchText: 'emergency plumbing parramatta',
    serviceArea: 'Parramatta and nearby suburbs',
    sourceHash: 'hash:search-source:1',
    generatedHash: 'hash:search-generated:1',
    updatedAt: 5,
  })
}

/**
 * Four published plumbers that differ only in what they published about price:
 * a two-Offering business with one cheap and one expensive job, a range, a
 * quote-on-request price, and an Offering carrying no structured price at all.
 */
function seedConvexOfferingPriceSupply(db: ConvexRegistryFakeDb): void {
  const supply: readonly {
    slug: string
    name: string
    offerings: readonly { name: string; price?: Record<string, unknown> }[]
  }[] = [
    {
      slug: 'budget-plumbing',
      name: 'Budget Plumbing',
      offerings: [
        { name: 'Tap washer replacement', price: { kind: 'fixed', currency: 'AUD', amountMinor: 10_000, unit: 'job', taxTreatment: 'inclusive' } },
        { name: 'Whole-house re-pipe', price: { kind: 'fixed', currency: 'AUD', amountMinor: 150_000, unit: 'job', taxTreatment: 'inclusive' } },
      ],
    },
    {
      slug: 'premium-plumbing',
      name: 'Premium Plumbing',
      offerings: [
        { name: 'Bathroom rough-in', price: { kind: 'range', currency: 'AUD', amountMinor: 30_000, maximumAmountMinor: 90_000, unit: 'job', taxTreatment: 'inclusive' } },
      ],
    },
    {
      slug: 'quoted-plumbing',
      name: 'Quoted Plumbing',
      offerings: [
        { name: 'Emergency plumbing call-out', price: { kind: 'quote_only', currency: 'AUD', taxTreatment: 'unstated' } },
      ],
    },
    {
      slug: 'unpriced-plumbing',
      name: 'Unpriced Plumbing',
      offerings: [{ name: 'General plumbing repairs' }],
    },
  ]

  supply.forEach((entry, index) => {
    const businessId = `businesses:price:${index}`
    db.seed('businesses', {
      _id: businessId,
      _creationTime: 10 + index,
      slug: entry.slug,
      name: entry.name,
      publicStatus: 'published',
      trustTier: 'claimed',
      updatedAt: 10 + index,
    })
    db.seed('catalogSupplyCutovers', {
      _id: `catalogSupplyCutovers:price:${index}`,
      _creationTime: 20 + index,
      businessId,
      mode: 'offering',
    })
    db.seed('businessSupplyProjectionSnapshots', {
      _id: `businessSupplyProjectionSnapshots:price:${index}`,
      _creationTime: 30 + index,
      businessId,
      status: 'current',
      projectionJson: JSON.stringify({
        business: {
          businessId,
          slug: entry.slug,
          name: entry.name,
          category: 'Plumbing',
          suburb: 'Perth',
          stateTerritory: 'WA',
          publicUrl: `/b/${entry.slug}`,
          trustTier: 'claimed',
        },
        offerings: entry.offerings.map((offering, offeringIndex) => ({
          offering: {
            offeringRef: `offering:${entry.slug}:${offeringIndex}`,
            revision: 1,
            name: offering.name,
            category: 'Plumbing',
            summary: `${offering.name} for Perth households.`,
            ...(offering.price === undefined ? {} : { price: offering.price }),
          },
          accessPaths: [],
          support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
        })),
        sourceRevision: 1,
        sourceDigest: `hash:projection:${entry.slug}`,
        observedAt: 30 + index,
        disposition: 'current',
      }),
    })
  })
}

function matchesConvexRegistryFilter(row: ConvexRegistryRow, filter: ConvexRegistryFilter): boolean {
  if (filter.op === 'eq') {
    return row[filter.field] === filter.value
  }
  if (filter.op === 'gte') {
    return String(row[filter.field] ?? '') >= String(filter.value)
  }
  return String(row[filter.field] ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => filter.value.includes(token))
}

function fakeCatalogSearchPort(
  overrides: Partial<CatalogSearchPort>,
): CatalogSearchPort {
  return {
    search: async () => ({
      kind: 'ok',
      backend: 'meilisearch',
      query: '',
      hits: [],
    }),
    addOrReplaceDocuments: async () => ({
      taskUid: '1',
      indexUid: 'registry',
      status: 'queued',
    }),
    deleteDocuments: async () => ({
      taskUid: '1',
      indexUid: 'registry',
      status: 'queued',
    }),
    configureIndex: async () => ({
      taskUid: '1',
      indexUid: 'registry',
      status: 'queued',
    }),
    readTask: async () => ({
      taskUid: '1',
      indexUid: 'registry',
      status: 'succeeded',
    }),
    ...overrides,
  }
}

function pageDto(
  items: readonly PublicBusinessCatalogApiDto[],
  query?: string,
): PublicBusinessCatalogApiPage {
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v1',
    ...(query === undefined ? {} : { query }),
    items,
    pagination: {
      limit: 10,
      total: items.length,
      hasMore: false,
    },
  }
}

function businessDto(
  overrides: Partial<PublicBusinessCatalogApiDto> = {},
): PublicBusinessCatalogApiDto {
  return {
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/parramatta-emergency-plumbing',
    trustTier: 'claimed',
    publicStatus: 'published',
    indexStatus: 'indexed',
    discoveryStatus: 'available',
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: 1_000,
    photos: [],
    services: [serviceDto()],
    ...overrides,
  }
}

function serviceDto(
  overrides: Partial<PublicBusinessCatalogApiDto['services'][number]> = {},
): PublicBusinessCatalogApiDto['services'][number] {
  return {
    slug: 'emergency-pipe-repair',
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Burst pipe triage and repair for urgent local plumbing jobs.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Hours supplied by owner',
    firstRequest: {
      mode: 'inquiry_available',
      publicDisclosure: 'Use the inquiry form for a first contact.',
      publicChannel: 'public_business_contact',
    },
    status: 'published',
    capabilities: [{ kind: 'quote_request', status: 'available' }],
    ...overrides,
  }
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = previous
}
