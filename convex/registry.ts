import { queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  catalogFromRows,
  projectRegistryCatalogApiItem,
} from '../src/modules/catalog/public'
import type { BusinessSupplyProjection } from '../src/modules/catalog/public'
import {
  adaptLegacyCatalogToOfferingApi,
  projectBusinessSupplyToPublicApi,
} from '../src/modules/registry/public'

import { runtimeReader } from './source_state'
import type {
  RuntimeDocument,
  RuntimeIndexBuilder,
  RuntimeQuery,
  RuntimeReader,
} from './source_state'

const firstRequestDto = v.object({
  mode: v.union(
    v.literal('inquiry_available'),
    v.literal('quote_request_available'),
    v.literal('not_available_yet'),
  ),
  publicDisclosure: v.string(),
  publicChannel: v.union(
    v.literal('public_business_contact'),
    v.literal('ae_status_only'),
    v.literal('not_available'),
  ),
  noContactReason: v.optional(v.string()),
})

const catalogItemDto = v.object({
  businessId: v.string(),
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  publishedPhone: v.optional(v.string()),
  postcode: v.optional(v.string()),
  publicUrl: v.string(),
  trustTier: v.union(
    v.literal('claimed'),
    v.literal('contact_confirmed'),
    v.literal('listed'),
    v.literal('registry_verified'),
  ),
  publicStatus: v.literal('published'),
  indexStatus: v.union(
    v.literal('not_queued'),
    v.literal('queued'),
    v.literal('indexed'),
    v.literal('failed'),
    v.literal('stale'),
  ),
  discoveryStatus: v.union(
    v.literal('unavailable'),
    v.literal('degraded'),
    v.literal('available'),
    v.literal('stale'),
  ),
  schemaVersion: v.literal('public-business-catalog-api:v1'),
  updatedAt: v.number(),
  photos: v.array(v.object({ url: v.string(), alt: v.string() })),
  responseTimeMinutes: v.optional(v.number()),
  services: v.array(
    v.object({
      slug: v.string(),
      name: v.string(),
      category: v.string(),
      summary: v.string(),
      serviceArea: v.string(),
      hoursOrUnknown: v.string(),
      firstRequest: firstRequestDto,
      status: v.literal('published'),
      capabilities: v.array(
        v.object({
          kind: v.union(
            v.literal('phone_inquiry'),
            v.literal('quote_request'),
            v.literal('booking_interest'),
            v.literal('emergency_callout_interest'),
            v.literal('ae_hosted_discovery'),
          ),
          status: v.union(
            v.literal('unavailable'),
            v.literal('degraded'),
            v.literal('available'),
            v.literal('stale'),
          ),
        }),
      ),
    }),
  ),
})

const pageResult = v.object({
  kind: v.literal('ok'),
  schemaVersion: v.literal('public-business-catalog-api:v1'),
  query: v.optional(v.string()),
  items: v.array(catalogItemDto),
  pagination: v.object({
    cursor: v.optional(v.string()),
    nextCursor: v.optional(v.string()),
    limit: v.number(),
    total: v.number(),
    hasMore: v.boolean(),
  }),
})

const detailResult = v.union(
  v.object({
    kind: v.literal('found'),
    schemaVersion: v.literal('public-business-catalog-api:v1'),
    business: catalogItemDto,
  }),
  v.object({
    kind: v.literal('not_found'),
    code: v.literal('business_not_found'),
    reason: v.string(),
  }),
)

const inquiryTargetResolution = v.union(
  v.object({
    kind: v.literal('resolved'),
    businessId: v.string(),
    serviceId: v.string(),
  }),
  v.object({
    kind: v.literal('not_found'),
    reason: v.string(),
  }),
)

const registryAttemptResult = v.object({
  businessId: v.string(),
  serviceId: v.optional(v.string()),
  logicalKey: v.string(),
  projectionKind: v.union(
    v.literal('business_catalog'),
    v.literal('service_catalog'),
  ),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  status: v.union(
    v.literal('queued'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('stale'),
  ),
  retryCount: v.number(),
  retryAfter: v.optional(v.number()),
  lastErrorCode: v.optional(v.string()),
  lastErrorRedacted: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  staleThresholdAt: v.optional(v.number()),
  repairAction: v.union(
    v.literal('retry_projection'),
    v.literal('rebuild_projection'),
    v.literal('no_repair'),
  ),
  repairResult: v.union(
    v.literal('not_run'),
    v.literal('succeeded'),
    v.literal('failed'),
  ),
})

const projectionItemResult = v.object({
  businessId: v.string(),
  serviceId: v.optional(v.string()),
  logicalKey: v.string(),
  projectionKind: v.union(
    v.literal('business_catalog'),
    v.literal('service_catalog'),
  ),
  publicStatus: v.literal('published'),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  generatedHash: v.string(),
  publicUrl: v.string(),
  serviceCount: v.number(),
  updatedAt: v.number(),
})

const healthResult = v.object({
  businessId: v.string(),
  sourceState: v.union(v.literal('published'), v.literal('not_public')),
  latestAttempt: v.optional(registryAttemptResult),
  indexStatus: v.union(
    v.literal('not_queued'),
    v.literal('queued'),
    v.literal('indexed'),
    v.literal('failed'),
    v.literal('stale'),
  ),
  projectionItems: v.array(projectionItemResult),
  affectedPublicSurfaces: v.array(v.string()),
  repairAction: v.union(
    v.literal('retry_projection'),
    v.literal('rebuild_projection'),
    v.literal('no_repair'),
  ),
  repairResult: v.union(
    v.literal('not_run'),
    v.literal('succeeded'),
    v.literal('failed'),
  ),
})

export const listPublicBusinessCatalog = queryGeneric({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: pageResult,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    const input = queryInput(args)
    return paginateCatalogs(
      await readPublicCatalogPage(db, input),
      input,
      undefined,
      await readPublishedBusinessTotal(db),
    )
  },
})

export const searchPublicBusinessCatalog = queryGeneric({
  args: {
    query: v.string(),
    mode: v.optional(v.union(v.literal('near_me'), v.literal('whole_catalogue'))),
    location: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: pageResult,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    const query = normalizeSearchText(args.query)
    if (query.length === 0) {
      return paginateCatalogs([], queryInput(args), '')
    }

    const tokens = query
      .split(' ')
      .filter((token) => !SEARCH_STOP_WORDS.has(token))
      .map(normalizeSearchToken)
    const locationKey = resolveSearchLocationKey(args)
    const matches = await readPublicSearchCatalogs(
      db,
      query,
      tokens,
      locationKey,
    )
    return paginateCatalogs(matches, queryInput(args), query)
  },
})

export const getPublicBusinessCatalogBySlug = queryGeneric({
  args: {
    slug: v.string(),
  },
  returns: detailResult,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    const catalog = await readPublicCatalogBySlug(db, normalizeSlug(args.slug))
    if (catalog === undefined) {
      return {
        kind: 'not_found' as const,
        code: 'business_not_found' as const,
        reason: 'No public business catalog exists for this slug.',
      }
    }

    return {
      kind: 'found' as const,
      schemaVersion: 'public-business-catalog-api:v1' as const,
      business: catalog,
    }
  },
})

/** Canonical v2 read. Legacy v1 queries remain only for explicit cutover fallback. */
export const listPublicBusinessOfferingSupply = queryGeneric({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    const input = queryInput(args)
    const rows = await readPublishedBusinessRows(db, input.cursor, normalizeLimit(input.limit) + 1)
    const items = (await Promise.all(rows.map((business) => readOfferingSupplyForBusiness(db, business))))
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
    return paginateOfferingSupply(items, input)
  },
})

export const searchPublicBusinessOfferingSupply = queryGeneric({
  args: {
    query: v.string(),
    mode: v.optional(v.union(v.literal('near_me'), v.literal('whole_catalogue'))),
    location: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    const input = queryInput(args)
    const needle = normalizeSearchText(args.query)
    if (needle.length === 0) return paginateOfferingSupply([], input, '')
    const tokens = needle.split(' ').filter((token) => !SEARCH_STOP_WORDS.has(token)).map(normalizeSearchToken)
    const locationKey = resolveSearchLocationKey(args)
    const rows = await readPublishedBusinessRows(db, undefined, CATALOG_TOTAL_COUNT_LIMIT + 1)
    const supply = (await Promise.all(rows.map((business) => readOfferingSupplyForBusiness(db, business))))
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
    const placesOf = (item: OfferingSupplyDto): readonly string[] =>
      [item.suburb, `${item.suburb} ${item.stateTerritory}`, item.stateTerritory, item.postcode]
        .filter((value): value is string => typeof value === 'string').map(normalizeSearchText)
    // Only treat an extracted location as a filter when it matches a real published place;
    // otherwise a bare category term (e.g. "dental", "cafe") is misread as a suburb and excludes everything.
    const effectiveLocationKey = locationKey !== undefined && supply.some((item) => placesOf(item).includes(locationKey))
      ? locationKey
      : undefined
    const items = supply
      .filter((item) => {
        if (effectiveLocationKey !== undefined && !placesOf(item).includes(effectiveLocationKey)) return false
        const haystack = normalizeSearchText([item.name, item.category, item.suburb, item.stateTerritory, ...item.offerings.flatMap((offering) => [offering.name, offering.category, offering.summary])].join(' '))
        return (tokens.length === 0 ? [needle] : tokens).every((token) => haystack.includes(token))
      })
    return paginateOfferingSupply(items, input, needle)
  },
})

export const getPublicBusinessOfferingSupplyBySlug = queryGeneric({
  args: { slug: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    const business = await db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug)))
      .unique()
    if (business === null || stringField(business, 'publicStatus') !== 'published') {
      return { kind: 'not_found', code: 'business_not_found', reason: 'No public business catalog exists for this slug.' }
    }
    const item = await readOfferingSupplyForBusiness(db, business)
    return item === undefined
      ? { kind: 'not_found', code: 'business_not_found', reason: 'No current public Offering projection exists for this business.' }
      : { kind: 'found', schemaVersion: 'public-business-catalog-api:v2', business: item }
  },
})

export const resolvePublishedInquiryTargetBySlug = queryGeneric({
  args: {
    businessSlug: v.string(),
    serviceSlug: v.string(),
  },
  returns: inquiryTargetResolution,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    return resolvePublishedInquiryTargetFromDb(
      db,
      normalizeSlug(args.businessSlug),
      normalizeSlug(args.serviceSlug),
    )
  },
})

export const readCatalogHealth = queryGeneric({
  args: {
    businessId: v.string(),
  },
  returns: healthResult,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    return readCatalogHealthFromDb(db, args.businessId)
  },
})

type RuntimeDb = RuntimeReader

type CatalogDto = {
  businessId: string
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  publishedPhone?: string
  postcode?: string
  publicUrl: string
  trustTier: CatalogTrustTier
  publicStatus: 'published'
  indexStatus: 'not_queued' | 'queued' | 'indexed' | 'failed' | 'stale'
  discoveryStatus: 'unavailable' | 'degraded' | 'available' | 'stale'
  schemaVersion: 'public-business-catalog-api:v1'
  updatedAt: number
  photos: { url: string; alt: string }[]
  responseTimeMinutes?: number
  services: ServiceDto[]
}

type ServiceDto = {
  slug: string
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequest: FirstRequestDto
  status: 'published'
  capabilities: CapabilityDto[]
}

type FirstRequestDto = {
  mode: 'inquiry_available' | 'quote_request_available' | 'not_available_yet'
  publicDisclosure: string
  publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
  noContactReason?: string
}

type CapabilityDto = {
  kind: CatalogCapabilityKind
  status: CatalogDiscoveryStatus
}

type CatalogTrustTier =
  'claimed' | 'contact_confirmed' | 'listed' | 'registry_verified'
type CatalogCapabilityKind =
  | 'phone_inquiry'
  | 'quote_request'
  | 'booking_interest'
  | 'emergency_callout_interest'
  | 'ae_hosted_discovery'
type CatalogDiscoveryStatus = 'unavailable' | 'degraded' | 'available' | 'stale'

type QueryInput = {
  cursor?: string
  limit?: number
}

const CATALOG_TOTAL_COUNT_LIMIT = 1_000
const SEARCH_DOCUMENT_CANDIDATE_LIMIT = 250
const SEARCH_FALLBACK_BUSINESS_SCAN_LIMIT = 250
const SEARCH_HYDRATION_BUSINESS_LIMIT = 100

export type RegistrySearchFallbackMetric = {
  name: 'registry.search.fallback_used'
  query: string
  tokenCount: number
  locationScoped: boolean
  scannedLimit: number
}

let registrySearchFallbackMetricSink: ((metric: RegistrySearchFallbackMetric) => void) | undefined

export function setRegistrySearchFallbackMetricSinkForTests(
  sink: ((metric: RegistrySearchFallbackMetric) => void) | undefined,
): () => void {
  const previous = registrySearchFallbackMetricSink
  registrySearchFallbackMetricSink = sink
  return () => {
    registrySearchFallbackMetricSink = previous
  }
}

function queryInput(args: { cursor?: string; limit?: number }): QueryInput {
  return {
    ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
    ...(args.limit === undefined ? {} : { limit: args.limit }),
  }
}

type RegistryAttempt = {
  businessId: string
  serviceId?: string
  logicalKey: string
  projectionKind: 'business_catalog' | 'service_catalog'
  sourceHash: string
  sourceVersion: 'public-catalog:v1'
  status: 'queued' | 'succeeded' | 'failed' | 'stale'
  retryCount: number
  retryAfter?: number
  lastErrorCode?: string
  lastErrorRedacted?: string
  startedAt: number
  finishedAt?: number
  staleThresholdAt?: number
  repairAction: 'retry_projection' | 'rebuild_projection' | 'no_repair'
  repairResult: 'not_run' | 'succeeded' | 'failed'
}

type PublicCatalogLookup = {
  contextsByBusinessId: Map<string, RuntimeDocument>
  servicesByBusinessId: Map<string, RuntimeDocument[]>
  capabilitiesByBusinessId: Map<string, RuntimeDocument[]>
  activeSuppressedBusinessIds: Set<string>
  indexStatusByBusinessId: Map<string, CatalogDto['indexStatus']>
  latestDiscoveryAttemptByBusinessId: Map<string, RuntimeDocument>
}

type RuntimeRangeIndexBuilder = RuntimeIndexBuilder & {
  gte: (field: string, value: unknown) => RuntimeIndexBuilder
}

type RuntimeSearchIndexBuilder = {
  search: (field: string, value: string) => RuntimeSearchIndexBuilder
  eq: (field: string, value: unknown) => RuntimeSearchIndexBuilder
}

type RuntimeBoundedQuery = RuntimeQuery & {
  take: (limit: number) => Promise<RuntimeDocument[]>
  withSearchIndex: (
    indexName: string,
    callback: (query: RuntimeSearchIndexBuilder) => RuntimeSearchIndexBuilder,
  ) => RuntimeQuery
}

function boundedQuery(query: RuntimeQuery): RuntimeBoundedQuery {
  return query as RuntimeBoundedQuery
}

function rangeIndex(query: RuntimeIndexBuilder): RuntimeRangeIndexBuilder {
  return query as RuntimeRangeIndexBuilder
}

async function takeDocuments(
  query: RuntimeQuery,
  limit: number,
): Promise<RuntimeDocument[]> {
  return boundedQuery(query).take(limit)
}

async function firstDocument(
  query: RuntimeQuery,
): Promise<RuntimeDocument | null> {
  if (typeof query.first === 'function') {
    return query.first()
  }
  return (await query.collect()).at(0) ?? null
}

async function readPublicCatalogPage(
  db: RuntimeDb,
  input: QueryInput,
): Promise<CatalogDto[]> {
  const limit = normalizeLimit(input.limit)
  const businesses = await readPublishedBusinessRows(db, input.cursor, limit + 1)
  const lookup = await readPublicCatalogLookup(
    db,
    businesses.map((business) => business._id),
  )
  const catalogs = catalogsFromBusinesses(lookup, businesses)
  return catalogs.slice(0, limit + 1)
}

async function readPublicCatalogsFromPublishedBusinessScan(
  db: RuntimeDb,
  limit: number,
): Promise<CatalogDto[]> {
  const businesses = await readPublishedBusinessRows(db, undefined, limit)
  const lookup = await readPublicCatalogLookup(
    db,
    businesses.map((business) => business._id),
  )
  return catalogsFromBusinesses(lookup, businesses)
}

async function readPublishedBusinessRows(
  db: RuntimeDb,
  cursor: string | undefined,
  limit: number,
): Promise<RuntimeDocument[]> {
  const effectiveCursor =
    cursor === undefined ? undefined : await publishedCursorSlug(db, cursor)
  return takeDocuments(
    db.query('businesses').withIndex('by_publicStatus_slug', (query) => {
      const published = query.eq('publicStatus', 'published')
      return effectiveCursor === undefined
        ? published
        : rangeIndex(published).gte('slug', effectiveCursor)
    }),
    limit,
  )
}

async function publishedCursorSlug(
  db: RuntimeDb,
  cursor: string,
): Promise<string | undefined> {
  const business = await db
    .query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', cursor))
    .unique()
  return business !== null && stringField(business, 'publicStatus') === 'published'
    ? cursor
    : undefined
}

async function readPublishedBusinessTotal(db: RuntimeDb): Promise<number> {
  const rows = await takeDocuments(
    db.query('businesses').withIndex('by_publicStatus_slug', (query) =>
      query.eq('publicStatus', 'published'),
    ),
    CATALOG_TOTAL_COUNT_LIMIT + 1,
  )
  // Convex has no efficient count aggregate; this keeps the public numeric
  // field bounded and exact for small catalogs, then acts as a safe lower bound.
  return rows.length
}

async function readPublicCatalogBySlug(
  db: RuntimeDb,
  slug: string,
): Promise<CatalogDto | undefined> {
  const business = await db
    .query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', slug))
    .unique()
  if (
    business === null ||
    stringField(business, 'publicStatus') !== 'published'
  ) {
    return undefined
  }

  const lookup = await readPublicCatalogLookup(db, [business._id])
  return catalogForBusinessFromLookup(lookup, business)
}

type OfferingSupplyDto = ReturnType<typeof projectBusinessSupplyToPublicApi>

export async function readOfferingSupplyForBusiness(
  db: RuntimeReader,
  business: RuntimeDocument,
): Promise<OfferingSupplyDto | undefined> {
  const suppression = await db.query('suppressionRules')
    .withIndex('by_target_status', (query) => query.eq('targetType', 'business').eq('targetRef', business._id).eq('status', 'active'))
    .unique()
  if (suppression !== null) return undefined

  const cutover = await db.query('catalogSupplyCutovers')
    .withIndex('by_businessId', (query) => query.eq('businessId', business._id))
    .unique()
  const mode = cutover === null ? 'legacy' : stringField(cutover, 'mode')
  if (mode === 'legacy' || mode === 'compare') {
    const lookup = await readPublicCatalogLookup(db, [business._id])
    const legacy = catalogForBusinessFromLookup(lookup, business)
    return legacy === undefined ? undefined : adaptLegacyCatalogToOfferingApi(legacy)
  }
  if (mode !== 'offering') return undefined

  const snapshot = await db.query('businessSupplyProjectionSnapshots')
    .withIndex('by_businessId', (query) => query.eq('businessId', business._id))
    .unique()
  if (snapshot === null) return undefined
  const json = stringField(snapshot, 'projectionJson')
  if (json === undefined) return undefined
  try {
    const projection = JSON.parse(json) as BusinessSupplyProjection
    if (
      projection === null
      || typeof projection !== 'object'
      || !Array.isArray(projection.offerings)
      || projection.business?.businessId !== business._id
      || projection.business?.slug !== stringField(business, 'slug')
    ) return undefined
    // Mask expired readiness at read time so public support cannot outlive its evidence.
    const projected = projectBusinessSupplyToPublicApi(projection, Date.now())
    return stringField(snapshot, 'status') === 'projection_pending'
      ? { ...projected, disposition: 'stale' }
      : projected
  } catch {
    return undefined
  }
}

function paginateOfferingSupply(
  items: readonly OfferingSupplyDto[],
  input: QueryInput,
  query?: string,
) {
  const limit = normalizeLimit(input.limit)
  const startIndex = input.cursor === undefined
    ? 0
    : Math.max(items.findIndex((item) => item.slug === input.cursor), 0)
  const pageItems = items.slice(startIndex, startIndex + limit)
  const next = items.at(startIndex + limit)
  return {
    kind: 'ok' as const,
    schemaVersion: 'public-business-catalog-api:v2' as const,
    ...(query === undefined ? {} : { query }),
    items: pageItems,
    pagination: {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(next === undefined ? {} : { nextCursor: next.slug }),
      limit,
      total: items.length,
      hasMore: next !== undefined,
    },
  }
}

async function resolvePublishedInquiryTargetFromDb(
  db: RuntimeDb,
  businessSlug: string,
  serviceSlug: string,
): Promise<
  | { kind: 'resolved'; businessId: string; serviceId: string }
  | { kind: 'not_found'; reason: string }
> {
  const business = await db
    .query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', businessSlug))
    .unique()
  if (
    business === null ||
    stringField(business, 'publicStatus') !== 'published'
  ) {
    return {
      kind: 'not_found',
      reason: 'No published business is discoverable for this slug.',
    }
  }

  const lookup = await readPublicCatalogLookup(db, [business._id])
  if (
    lookup.activeSuppressedBusinessIds.has(business._id) ||
    catalogForBusinessFromLookup(lookup, business) === undefined
  ) {
    return {
      kind: 'not_found',
      reason: 'No published business is discoverable for this slug.',
    }
  }

  const service = (lookup.servicesByBusinessId.get(business._id) ?? []).find(
    (row) => stringField(row, 'serviceSlug') === serviceSlug,
  )
  if (service === undefined) {
    return {
      kind: 'not_found',
      reason:
        'No published service is discoverable for this slug on the business.',
    }
  }

  return {
    kind: 'resolved',
    businessId: business._id,
    serviceId: service._id,
  }
}

async function readPublicSearchCatalogs(
  db: RuntimeDb,
  query: string,
  tokens: readonly string[],
  locationKey: string | undefined,
): Promise<CatalogDto[]> {
  const indexedMatches = await readSearchDocumentCatalogs(
    db,
    query,
    tokens,
    locationKey,
  )
  if (indexedMatches.length > 0) {
    return indexedMatches.filter((catalog) =>
      matchesCatalog(catalog, tokens, locationKey),
    )
  }

  const fallbackCatalogs = await readPublicCatalogsFromPublishedBusinessScan(
    db,
    SEARCH_FALLBACK_BUSINESS_SCAN_LIMIT,
  )
  registrySearchFallbackMetricSink?.({
    name: 'registry.search.fallback_used',
    query,
    tokenCount: tokens.length,
    locationScoped: locationKey !== undefined,
    scannedLimit: SEARCH_FALLBACK_BUSINESS_SCAN_LIMIT,
  })
  return fallbackCatalogs.filter((catalog) =>
    matchesCatalog(catalog, tokens, locationKey),
  )
}

async function readSearchDocumentCatalogs(
  db: RuntimeDb,
  query: string,
  tokens: readonly string[],
  locationKey: string | undefined,
): Promise<CatalogDto[]> {
  const searchText = tokens.length === 0 ? query : tokens.join(' ')
  if (searchText.length === 0) {
    return []
  }

  const documents = await takeDocuments(
    boundedQuery(db.query('registrySearchDocuments')).withSearchIndex(
      'search_searchText_by_publicStatus',
      (search) =>
        search.search('searchText', searchText).eq('publicStatus', 'published'),
    ),
    SEARCH_DOCUMENT_CANDIDATE_LIMIT,
  )
  const businessSlugs = uniqueBusinessSlugs(
    documents.filter((document) =>
      matchesSearchDocument(document, tokens, locationKey),
    ),
  ).slice(0, SEARCH_HYDRATION_BUSINESS_LIMIT)
  const catalogs = await Promise.all(
    businessSlugs.map((slug) => readPublicCatalogBySlug(db, slug)),
  )
  return catalogs
    .filter((catalog): catalog is CatalogDto => catalog !== undefined)
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function matchesSearchDocument(
  document: RuntimeDocument,
  tokens: readonly string[],
  locationKey: string | undefined,
): boolean {
  if (stringField(document, 'publicStatus') !== 'published') {
    return false
  }
  if (
    locationKey !== undefined &&
    !stringArrayField(document, 'placeKeys').includes(locationKey)
  ) {
    return false
  }

  const searchText = stringField(document, 'searchText')
  return tokens.every((token) => searchText.includes(token))
}

function uniqueBusinessSlugs(
  documents: readonly RuntimeDocument[],
): string[] {
  const slugs = new Set<string>()
  for (const document of documents) {
    const slug = stringField(document, 'businessSlug')
    if (slug.length > 0) {
      slugs.add(slug)
    }
  }
  return [...slugs]
}

function catalogsFromBusinesses(
  lookup: PublicCatalogLookup,
  businesses: readonly RuntimeDocument[],
): CatalogDto[] {
  const catalogs: CatalogDto[] = []
  for (const business of businesses) {
    if (lookup.activeSuppressedBusinessIds.has(business._id)) {
      continue
    }

    const catalog = catalogForBusinessFromLookup(lookup, business)
    if (catalog !== undefined) {
      catalogs.push(catalog)
    }
  }
  return catalogs.sort((left, right) => left.slug.localeCompare(right.slug))
}

async function readPublicCatalogLookup(
  db: RuntimeDb,
  businessIds: readonly string[],
): Promise<PublicCatalogLookup> {
  const uniqueBusinessIds = [...new Set(businessIds)].filter(
    (businessId) => businessId.length > 0,
  )
  const [
    contextEntries,
    serviceEntries,
    capabilityEntries,
    suppressedBusinessIds,
    indexStatusEntries,
    discoveryAttemptEntries,
  ] = await Promise.all([
    Promise.all(
      uniqueBusinessIds.map(async (businessId) => [
        businessId,
        await firstDocument(
          db
            .query('businessContexts')
            .withIndex('by_business', (query) =>
              query.eq('businessId', businessId),
            ),
        ),
      ] as const),
    ),
    Promise.all(
      uniqueBusinessIds.map(async (businessId) => [
        businessId,
        await db
          .query('businessServices')
          .withIndex('by_business_status', (query) =>
            query.eq('businessId', businessId).eq('status', 'published'),
          )
          .collect(),
      ] as const),
    ),
    Promise.all(
      uniqueBusinessIds.map(async (businessId) => [
        businessId,
        await db
          .query('serviceCapabilities')
          .withIndex('by_business_service_status', (query) =>
            query.eq('businessId', businessId),
          )
          .collect(),
      ] as const),
    ),
    Promise.all(
      uniqueBusinessIds.map(async (businessId) => [
        businessId,
        await firstDocument(
          db
            .query('suppressionRules')
            .withIndex('by_target_status', (query) =>
              query
                .eq('targetType', 'business')
                .eq('targetRef', businessId)
                .eq('status', 'active'),
            ),
        ),
      ] as const),
    ),
    Promise.all(
      uniqueBusinessIds.map(async (businessId) => [
        businessId,
        await db
          .query('indexStatus')
          .withIndex('by_target_status', (query) =>
            query.eq('targetType', 'business').eq('targetRef', businessId),
          )
          .collect(),
      ] as const),
    ),
    Promise.all(
      uniqueBusinessIds.map(async (businessId) => [
        businessId,
        await db
          .query('discoveryManifestAttempts')
          .withIndex('by_business_status', (query) =>
            query.eq('businessId', businessId),
          )
          .collect(),
      ] as const),
    ),
  ])

  return {
    contextsByBusinessId: new Map(
      contextEntries.flatMap(([businessId, context]) =>
        context === null ? [] : [[businessId, context] as const],
      )
    ),
    servicesByBusinessId: new Map(serviceEntries),
    capabilitiesByBusinessId: new Map(capabilityEntries),
    activeSuppressedBusinessIds: new Set(
      suppressedBusinessIds.flatMap(([businessId, suppression]) =>
        suppression === null ? [] : [businessId],
      ),
    ),
    indexStatusByBusinessId: new Map(
      indexStatusEntries.map(([businessId, statuses]) => [
        businessId,
        indexStatusesByBusinessId(statuses).get(businessId) ?? 'not_queued',
      ]),
    ),
    latestDiscoveryAttemptByBusinessId: new Map(
      discoveryAttemptEntries.flatMap(([businessId, attempts]) => {
        const latest = latestByStringField(
          attempts,
          'businessId',
          'startedAt',
        ).get(businessId)
        return latest === undefined ? [] : [[businessId, latest] as const]
      }),
    ),
  }
}

export function catalogForBusinessFromLookup(
  lookup: PublicCatalogLookup,
  business: RuntimeDocument,
): CatalogDto | undefined {
  const context = lookup.contextsByBusinessId.get(business._id)
  if (context === undefined) {
    return undefined
  }

  const services = lookup.servicesByBusinessId.get(business._id) ?? []

  const capabilities = lookup.capabilitiesByBusinessId.get(business._id) ?? []
  const catalog = catalogFromRows({
    businessId: business._id,
    slug: stringField(business, 'slug'),
    name: stringField(business, 'name'),
    category: stringField(context, 'category'),
    suburb: stringField(context, 'suburb'),
    stateTerritory: stringField(context, 'stateTerritory'),
    sourceHash: stringField(business, 'sourceHash'),
    updatedAt: numberField(business, 'updatedAt'),
    trustTier: trustTier(business),
    indexStatus: lookup.indexStatusByBusinessId.get(business._id) ?? 'not_queued',
    discoveryStatus: discoveryStatusForAttempt(
      lookup.latestDiscoveryAttemptByBusinessId.get(business._id),
      stringField(business, 'sourceHash'),
    ),
    ...(optionalStringField(business, 'publishedPhone') === undefined
      ? {}
      : { publishedPhone: stringField(business, 'publishedPhone') }),
    ...(optionalStringField(context, 'postcode') === undefined
      ? {}
      : { postcode: stringField(context, 'postcode') }),
    photos: photosField(context, 'photos'),
    ...(optionalNumberField(context, 'responseTimeMinutes') === undefined
      ? {}
      : { responseTimeMinutes: numberField(context, 'responseTimeMinutes') }),
    services: [...services]
      .sort(
        (left, right) =>
          numberField(left, 'sortOrder') - numberField(right, 'sortOrder'),
      )
      .map((service) => ({
        serviceId: service._id,
        serviceSlug: stringField(service, 'serviceSlug'),
        name: stringField(service, 'name'),
        category: stringField(service, 'category'),
        summary: stringField(service, 'summary'),
        serviceArea: stringField(service, 'serviceArea'),
        hoursOrUnknown: stringField(service, 'hoursOrUnknown'),
        sortOrder: numberField(service, 'sortOrder'),
        sourceHash: stringField(service, 'sourceHash'),
        status: 'published' as const,
      })),
    capabilities: capabilities.map((capability) => ({
      serviceId: stringField(capability, 'serviceId'),
      kind: capabilityKind(capability),
      status: capabilityStatus(capability),
      firstRequest: toFirstRequestDto(capability),
      ...(optionalStringField(capability, 'reason') === undefined
        ? {}
        : { reason: stringField(capability, 'reason') }),
      sourceHash: stringField(capability, 'sourceHash'),
    })),
  })
  return catalog === undefined
    ? undefined
    : projectRegistryCatalogApiItem(catalog) as CatalogDto
}

function firstByStringField(
  rows: readonly RuntimeDocument[],
  field: string,
): Map<string, RuntimeDocument> {
  const grouped = new Map<string, RuntimeDocument>()
  for (const row of rows) {
    const key = stringField(row, field)
    if (key.length > 0 && !grouped.has(key)) {
      grouped.set(key, row)
    }
  }
  return grouped
}

function groupByStringField(
  rows: readonly RuntimeDocument[],
  field: string,
): Map<string, RuntimeDocument[]> {
  const grouped = new Map<string, RuntimeDocument[]>()
  for (const row of rows) {
    const key = stringField(row, field)
    if (key.length === 0) {
      continue
    }
    const group = grouped.get(key)
    if (group === undefined) {
      grouped.set(key, [row])
    } else {
      group.push(row)
    }
  }
  return grouped
}

function latestByStringField(
  rows: readonly RuntimeDocument[],
  groupField: string,
  sortField: string,
): Map<string, RuntimeDocument> {
  const latestByGroup = new Map<string, RuntimeDocument>()
  for (const row of rows) {
    const key = stringField(row, groupField)
    if (key.length === 0) {
      continue
    }
    const current = latestByGroup.get(key)
    if (
      current === undefined ||
      numberField(row, sortField) > numberField(current, sortField)
    ) {
      latestByGroup.set(key, row)
    }
  }
  return latestByGroup
}

function indexStatusesByBusinessId(
  statuses: readonly RuntimeDocument[],
): Map<string, CatalogDto['indexStatus']> {
  const byBusinessId = new Map<string, CatalogDto['indexStatus']>()
  for (const status of statuses) {
    if (stringField(status, 'targetType') !== 'business') {
      continue
    }
    const businessId = stringField(status, 'targetRef')
    if (businessId.length > 0 && !byBusinessId.has(businessId)) {
      byBusinessId.set(businessId, indexStatusFromDocument(status))
    }
  }
  return byBusinessId
}

function toServiceDto(
  service: RuntimeDocument,
  capabilities: readonly RuntimeDocument[],
): ServiceDto {
  const serviceCapabilities = capabilities.filter(
    (capability) => stringField(capability, 'serviceId') === service._id,
  )
  const firstCapability = serviceCapabilities.at(0)
  return {
    slug: stringField(service, 'serviceSlug'),
    name: stringField(service, 'name'),
    category: stringField(service, 'category'),
    summary: stringField(service, 'summary'),
    serviceArea: stringField(service, 'serviceArea'),
    hoursOrUnknown: stringField(service, 'hoursOrUnknown'),
    firstRequest:
      firstCapability === undefined
        ? unavailableFirstRequest()
        : toFirstRequestDto(firstCapability),
    status: 'published',
    capabilities: serviceCapabilities.map((capability) => ({
      kind: capabilityKind(capability),
      status: capabilityStatus(capability),
    })),
  }
}

function toFirstRequestDto(capability: RuntimeDocument): FirstRequestDto {
  return {
    mode: firstRequestMode(capability),
    publicDisclosure: stringField(capability, 'publicDisclosure'),
    publicChannel: publicChannel(capability),
    ...(optionalStringField(capability, 'noContactReason') === undefined
      ? {}
      : { noContactReason: stringField(capability, 'noContactReason') }),
  }
}

function unavailableFirstRequest(): FirstRequestDto {
  return {
    mode: 'not_available_yet',
    publicDisclosure: 'First request is not available yet.',
    publicChannel: 'not_available',
    noContactReason: 'Owner has not supplied public contact instructions.',
  }
}

function paginateCatalogs(
  items: readonly CatalogDto[],
  input: QueryInput,
  query?: string,
  total?: number,
) {
  const limit = normalizeLimit(input.limit)
  const startIndex =
    input.cursor === undefined
      ? 0
      : Math.max(
          items.findIndex((item) => item.slug === input.cursor),
          0,
        )
  const pageItems = items.slice(startIndex, startIndex + limit)
  const next = items.at(startIndex + limit)
  return {
    kind: 'ok' as const,
    schemaVersion: 'public-business-catalog-api:v1' as const,
    ...(query === undefined ? {} : { query }),
    items: pageItems,
    pagination: {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(next === undefined ? {} : { nextCursor: next.slug }),
      limit,
      total: total ?? items.length,
      hasMore: next !== undefined,
    },
  }
}

async function readCatalogHealthFromDb(db: RuntimeDb, businessId: string) {
  const business = await db.get(businessId)
  const sourceState: 'published' | 'not_public' =
    business !== null &&
    stringField(business, 'publicStatus') === 'published' &&
    (await publishedServiceCount(db, businessId)) > 0
      ? 'published'
      : 'not_public'
  const latestAttempt = await latestRegistryAttempt(db, businessId)
  return {
    businessId,
    sourceState,
    ...(latestAttempt === undefined ? {} : { latestAttempt }),
    indexStatus: await indexStatusForBusiness(db, businessId),
    projectionItems: await projectionItemsForBusiness(db, businessId),
    affectedPublicSurfaces: [
      '/registry',
      '/api/businesses',
      '/api/businesses/search',
      '/api/businesses/{slug}',
    ],
    repairAction:
      latestAttempt?.repairAction ??
      (sourceState === 'published' ? 'rebuild_projection' : 'no_repair'),
    repairResult: latestAttempt?.repairResult ?? 'not_run',
  }
}

async function latestRegistryAttempt(
  db: RuntimeDb,
  businessId: string,
): Promise<RegistryAttempt | undefined> {
  const attempts = await db
    .query('registryProjectionAttempts')
    .withIndex('by_business_status', (query) =>
      query.eq('businessId', businessId),
    )
    .collect()
  const latest = attempts
    .sort(
      (left, right) =>
        numberField(right, 'startedAt') - numberField(left, 'startedAt'),
    )
    .at(0)
  return latest === undefined ? undefined : toRegistryAttempt(latest)
}

function toRegistryAttempt(attempt: RuntimeDocument): RegistryAttempt {
  return {
    businessId: stringField(attempt, 'businessId'),
    ...(optionalStringField(attempt, 'serviceId') === undefined
      ? {}
      : { serviceId: stringField(attempt, 'serviceId') }),
    logicalKey: stringField(attempt, 'logicalKey'),
    projectionKind:
      stringField(attempt, 'projectionKind') === 'service_catalog'
        ? 'service_catalog'
        : 'business_catalog',
    sourceHash: stringField(attempt, 'sourceHash'),
    sourceVersion: 'public-catalog:v1',
    status: registryStatus(attempt),
    retryCount: numberField(attempt, 'retryCount'),
    ...(optionalNumberField(attempt, 'retryAfter') === undefined
      ? {}
      : { retryAfter: numberField(attempt, 'retryAfter') }),
    ...(optionalStringField(attempt, 'lastErrorCode') === undefined
      ? {}
      : { lastErrorCode: stringField(attempt, 'lastErrorCode') }),
    ...(optionalStringField(attempt, 'lastErrorRedacted') === undefined
      ? {}
      : { lastErrorRedacted: stringField(attempt, 'lastErrorRedacted') }),
    startedAt: numberField(attempt, 'startedAt'),
    ...(optionalNumberField(attempt, 'finishedAt') === undefined
      ? {}
      : { finishedAt: numberField(attempt, 'finishedAt') }),
    ...(optionalNumberField(attempt, 'staleThresholdAt') === undefined
      ? {}
      : { staleThresholdAt: numberField(attempt, 'staleThresholdAt') }),
    repairAction: registryRepairAction(attempt),
    repairResult: repairResult(attempt),
  }
}

async function projectionItemsForBusiness(db: RuntimeDb, businessId: string) {
  const items = await db
    .query('registryProjectionItems')
    .withIndex('by_business', (query) => query.eq('businessId', businessId))
    .collect()
  return items.map((item) => ({
    businessId: stringField(item, 'businessId'),
    ...(optionalStringField(item, 'serviceId') === undefined
      ? {}
      : { serviceId: stringField(item, 'serviceId') }),
    logicalKey: stringField(item, 'logicalKey'),
    projectionKind:
      stringField(item, 'projectionKind') === 'service_catalog'
        ? ('service_catalog' as const)
        : ('business_catalog' as const),
    publicStatus: 'published' as const,
    sourceHash: stringField(item, 'sourceHash'),
    sourceVersion: 'public-catalog:v1' as const,
    generatedHash: stringField(item, 'generatedHash'),
    publicUrl: stringField(item, 'publicUrl'),
    serviceCount: numberField(item, 'serviceCount'),
    updatedAt: numberField(item, 'updatedAt'),
  }))
}

async function publishedServiceCount(
  db: RuntimeDb,
  businessId: string,
): Promise<number> {
  const services = await takeDocuments(
    db
      .query('businessServices')
      .withIndex('by_business_status', (query) =>
        query.eq('businessId', businessId).eq('status', 'published'),
      ),
    1,
  )
  return services.length
}

async function indexStatusForBusiness(
  db: RuntimeDb,
  businessId: string,
): Promise<CatalogDto['indexStatus']> {
  const statuses = await db
    .query('indexStatus')
    .withIndex('by_target_status', (query) =>
      query.eq('targetType', 'business').eq('targetRef', businessId),
    )
    .collect()
  const status = statuses.find(
    (candidate) =>
      stringField(candidate, 'targetType') === 'business' &&
      stringField(candidate, 'targetRef') === businessId,
  )
  return indexStatusFromDocument(status)
}

function indexStatusFromDocument(
  status: RuntimeDocument | undefined,
): CatalogDto['indexStatus'] {
  const value = status === undefined ? undefined : stringField(status, 'status')
  return value === 'queued' ||
    value === 'indexed' ||
    value === 'failed' ||
    value === 'stale'
    ? value
    : 'not_queued'
}

function discoveryStatusForAttempt(
  latest: RuntimeDocument | undefined,
  sourceHash: string,
): CatalogDto['discoveryStatus'] {
  if (latest === undefined) {
    return 'degraded'
  }
  if (
    stringField(latest, 'sourceHash') !== sourceHash ||
    stringField(latest, 'status') === 'stale'
  ) {
    return 'stale'
  }
  return stringField(latest, 'status') === 'succeeded'
    ? 'available'
    : 'degraded'
}

const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'around',
  'at',
  'business',
  'businesses',
  'find',
  'for',
  'in',
  'near',
  'need',
  'now',
  'open',
  'provider',
  'providers',
  'service',
  'services',
  'the',
  'to',
])

const SERVICE_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  'appointment',
  'callout',
  'cleaner',
  'cleaners',
  'day',
  'dentist',
  'dentists',
  'diagnostic',
  'diagnostics',
  'electrician',
  'electricians',
  'emergency',
  'heat',
  'help',
  'hot',
  'locksmith',
  'locksmiths',
  'mechanic',
  'mechanics',
  'metro',
  'plumber',
  'plumbers',
  'plumbing',
  'pump',
  'repair',
  'repairs',
  'same',
  'suburb',
  'suburbs',
  'today',
  'tomorrow',
  'trade',
  'trades',
  'urgent',
  'water',
])

const STATE_WORDS = new Set(['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'])
const LOCATION_PREPOSITION = /\b(?:in|near|around|at)\s+([a-z][a-z\s'-]{1,80})(?:\?|$)/i

function matchesCatalog(
  catalog: CatalogDto,
  queryTokens: readonly string[],
  locationKey: string | undefined,
): boolean {
  if (locationKey !== undefined && !catalogPlaceKeys(catalog).includes(locationKey)) {
    return false
  }

  const haystack = normalizeSearchText(
    [
      catalog.name,
      catalog.category,
      catalog.suburb,
      catalog.stateTerritory,
      catalog.postcode ?? '',
      ...catalog.services.flatMap((service) => [
        service.name,
        service.category,
        service.summary,
        service.serviceArea,
      ]),
    ].join(' '),
  )
  return queryTokens.every((token) => haystack.includes(token))
}

function resolveSearchLocationKey(input: { query: string; mode?: string; location?: string }): string | undefined {
  if (input.mode === 'whole_catalogue') {
    return undefined
  }
  const explicit = normalizeLocationLabel(input.location)
  if (explicit !== undefined) {
    return normalizeSearchText(explicit)
  }
  const fromQuery = extractLocationFromQuery(input.query)
  return fromQuery === undefined ? undefined : normalizeSearchText(fromQuery)
}

function catalogPlaceKeys(catalog: CatalogDto): readonly string[] {
  const keys = new Set<string>()
  addPlaceKey(keys, catalog.suburb)
  addPlaceKey(keys, `${catalog.suburb} ${catalog.stateTerritory}`)
  addPlaceKey(keys, catalog.stateTerritory)
  if (catalog.postcode !== undefined) {
    addPlaceKey(keys, catalog.postcode)
  }
  for (const service of catalog.services) {
    for (const candidate of extractPlaceCandidates(service.serviceArea)) {
      addPlaceKey(keys, candidate)
    }
  }
  return [...keys].sort()
}

function extractLocationFromQuery(query: string): string | undefined {
  const normalized = normalizeLocationLabel(query)
  if (normalized === undefined) {
    return undefined
  }
  const prepositionMatch = normalized.match(LOCATION_PREPOSITION)
  if (prepositionMatch?.[1] !== undefined) {
    return normalizeLocationLabel(prepositionMatch[1])
  }
  const tokens = normalized.split(/\s+/).filter(Boolean)
  const withoutState = dropTrailingState(tokens)
  const candidate = trimServiceWords(withoutState).join(' ')
  return normalizeLocationLabel(candidate)
}

function extractPlaceCandidates(value: string): readonly string[] {
  const normalized = normalizeSearchText(value)
  if (normalized.length === 0) {
    return []
  }
  return normalized
    .replace(/\band nearby suburbs\b/g, '|')
    .replace(/\bnearby suburbs\b/g, '|')
    .replace(/\bmetro\b/g, ' metro|')
    .split(/[|,;/]+/g)
    .map((candidate) => trimServiceWords(candidate.split(/\s+/).filter(Boolean)).join(' '))
    .map((candidate) => candidate.replace(/\bmetro\b/g, '').trim())
    .filter((candidate) => candidate.length >= 3)
}

function normalizeLocationLabel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const words = value
    .trim()
    .replace(/[^a-z0-9\s'-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STATE_WORDS.has(word.toLowerCase()))
  while (words.length > 0 && SERVICE_WORDS.has(words[0]!.toLowerCase())) {
    words.shift()
  }
  while (words.length > 0 && SERVICE_WORDS.has(words.at(-1)!.toLowerCase())) {
    words.pop()
  }
  const label = words.join(' ').trim()
  return label.length >= 3 ? label : undefined
}

function dropTrailingState(tokens: readonly string[]): readonly string[] {
  const last = tokens.at(-1)?.toLowerCase()
  return last !== undefined && STATE_WORDS.has(last) ? tokens.slice(0, -1) : tokens
}

function trimServiceWords(tokens: readonly string[]): readonly string[] {
  let start = 0
  let end = tokens.length
  while (start < end && SERVICE_WORDS.has(tokens[start]!.toLowerCase())) {
    start += 1
  }
  while (end > start && SERVICE_WORDS.has(tokens[end - 1]!.toLowerCase())) {
    end -= 1
  }
  return tokens.slice(start, end)
}

function addPlaceKey(keys: Set<string>, value: string): void {
  const key = normalizeSearchText(value)
  if (key.length > 0) {
    keys.add(key)
  }
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeSearchToken(token: string): string {
  return token === 'plumber' || token === 'plumbers' ? 'plumbing' : token
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function stringField(document: RuntimeDocument, field: string): string {
  const value = document[field]
  return typeof value === 'string' ? value : ''
}

function optionalStringField(
  document: RuntimeDocument,
  field: string,
): string | undefined {
  const value = document[field]
  return typeof value === 'string' ? value : undefined
}

function stringArrayField(
  document: RuntimeDocument,
  field: string,
): string[] {
  const value = document[field]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function numberField(document: RuntimeDocument, field: string): number {
  const value = document[field]
  return typeof value === 'number' ? value : 0
}

function optionalNumberField(
  document: RuntimeDocument,
  field: string,
): number | undefined {
  const value = document[field]
  return typeof value === 'number' ? value : undefined
}

function photosField(
  document: RuntimeDocument,
  field: string,
): { url: string; alt: string }[] {
  const value = document[field]
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((photo) => {
      if (photo === null || typeof photo !== 'object') {
        return undefined
      }
      const record = photo as Record<string, unknown>
      return typeof record.url === 'string' && typeof record.alt === 'string'
        ? { url: record.url, alt: record.alt }
        : undefined
    })
    .filter(
      (photo): photo is { url: string; alt: string } => photo !== undefined,
    )
}

function firstRequestMode(document: RuntimeDocument): FirstRequestDto['mode'] {
  const value = stringField(document, 'firstRequestMode')
  if (
    value === 'inquiry_available' ||
    value === 'quote_request_available' ||
    value === 'not_available_yet'
  ) {
    return value
  }
  return 'not_available_yet'
}

function publicChannel(
  document: RuntimeDocument,
): FirstRequestDto['publicChannel'] {
  const value = stringField(document, 'publicChannel')
  if (
    value === 'public_business_contact' ||
    value === 'ae_status_only' ||
    value === 'not_available'
  ) {
    return value
  }
  return 'not_available'
}

function trustTier(document: RuntimeDocument): CatalogTrustTier {
  const value = stringField(document, 'trustTier')
  return value === 'contact_confirmed' ||
    value === 'listed' ||
    value === 'registry_verified'
    ? value
    : 'claimed'
}

function capabilityKind(document: RuntimeDocument): CatalogCapabilityKind {
  const value = stringField(document, 'kind')
  if (
    value === 'phone_inquiry' ||
    value === 'quote_request' ||
    value === 'booking_interest' ||
    value === 'emergency_callout_interest' ||
    value === 'ae_hosted_discovery'
  ) {
    return value
  }
  return 'ae_hosted_discovery'
}

function capabilityStatus(document: RuntimeDocument): CatalogDiscoveryStatus {
  const value = stringField(document, 'status')
  if (value === 'available' || value === 'degraded' || value === 'stale') {
    return value
  }
  return 'unavailable'
}

function registryStatus(document: RuntimeDocument): RegistryAttempt['status'] {
  const value = stringField(document, 'status')
  if (
    value === 'queued' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'stale'
  ) {
    return value
  }
  return 'queued'
}

function registryRepairAction(
  document: RuntimeDocument,
): RegistryAttempt['repairAction'] {
  const value = stringField(document, 'repairAction')
  if (
    value === 'retry_projection' ||
    value === 'rebuild_projection' ||
    value === 'no_repair'
  ) {
    return value
  }
  return 'no_repair'
}

function repairResult(
  document: RuntimeDocument,
): RegistryAttempt['repairResult'] {
  const value = stringField(document, 'repairResult')
  if (value === 'not_run' || value === 'succeeded' || value === 'failed') {
    return value
  }
  return 'not_run'
}

export type {
  IndexStatus,
  RegistryProjectionAttemptContract,
} from '../src/modules/registry/public'
