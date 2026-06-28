import { queryGeneric } from 'convex/server'
import { v } from 'convex/values'

const firstRequestDto = v.object({
  mode: v.union(v.literal('inquiry_available'), v.literal('quote_request_available'), v.literal('not_available_yet')),
  publicDisclosure: v.string(),
  publicChannel: v.union(v.literal('public_business_contact'), v.literal('ae_status_only'), v.literal('not_available')),
  noContactReason: v.optional(v.string()),
})

const catalogItemDto = v.object({
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  postcode: v.optional(v.string()),
  publicUrl: v.string(),
  trustTier: v.string(),
  publicStatus: v.literal('published'),
  indexStatus: v.union(v.literal('not_queued'), v.literal('queued'), v.literal('indexed'), v.literal('failed'), v.literal('stale')),
  discoveryStatus: v.union(v.literal('unavailable'), v.literal('degraded'), v.literal('available'), v.literal('stale')),
  schemaVersion: v.literal('public-business-catalog-api:v1'),
  updatedAt: v.number(),
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
          kind: v.string(),
          status: v.string(),
        })
      ),
    })
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
  })
)

const registryAttemptResult = v.object({
  businessId: v.string(),
  serviceId: v.optional(v.string()),
  logicalKey: v.string(),
  projectionKind: v.union(v.literal('business_catalog'), v.literal('service_catalog')),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  status: v.union(v.literal('queued'), v.literal('succeeded'), v.literal('failed'), v.literal('stale')),
  retryCount: v.number(),
  retryAfter: v.optional(v.number()),
  lastErrorCode: v.optional(v.string()),
  lastErrorRedacted: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  staleThresholdAt: v.optional(v.number()),
  repairAction: v.union(v.literal('retry_projection'), v.literal('rebuild_projection'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const projectionItemResult = v.object({
  businessId: v.string(),
  serviceId: v.optional(v.string()),
  logicalKey: v.string(),
  projectionKind: v.union(v.literal('business_catalog'), v.literal('service_catalog')),
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
  indexStatus: v.union(v.literal('not_queued'), v.literal('queued'), v.literal('indexed'), v.literal('failed'), v.literal('stale')),
  projectionItems: v.array(projectionItemResult),
  affectedPublicSurfaces: v.array(v.string()),
  repairAction: v.union(v.literal('retry_projection'), v.literal('rebuild_projection'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

export const listPublicBusinessCatalog = queryGeneric({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: pageResult,
  handler: async (ctx, args) => {
    // Convex's generic db type does not expose this source-owned table bundle without generated types.
    const db = ctx.db as unknown as RuntimeDb
    return paginateCatalogs(await readPublicCatalogs(db), queryInput(args))
  },
})

export const searchPublicBusinessCatalog = queryGeneric({
  args: {
    query: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: pageResult,
  handler: async (ctx, args) => {
    // Convex's generic db type does not expose this source-owned table bundle without generated types.
    const db = ctx.db as unknown as RuntimeDb
    const query = normalizeSearchText(args.query)
    if (query.length === 0) {
      return paginateCatalogs([], queryInput(args), '')
    }

    const tokens = query.split(' ').map(normalizeSearchToken)
    const matches = (await readPublicCatalogs(db)).filter((catalog) => matchesCatalog(catalog, tokens))
    return paginateCatalogs(matches, queryInput(args), query)
  },
})

export const getPublicBusinessCatalogBySlug = queryGeneric({
  args: {
    slug: v.string(),
  },
  returns: detailResult,
  handler: async (ctx, args) => {
    // Convex's generic db type does not expose this source-owned table bundle without generated types.
    const db = ctx.db as unknown as RuntimeDb
    const catalogs = await readPublicCatalogs(db)
    const catalog = catalogs.find((candidate) => candidate.slug === normalizeSlug(args.slug))
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

export const readCatalogHealth = queryGeneric({
  args: {
    businessId: v.string(),
  },
  returns: healthResult,
  handler: async (ctx, args) => {
    // Convex's generic db type does not expose this source-owned table bundle without generated types.
    const db = ctx.db as unknown as RuntimeDb
    return readCatalogHealthFromDb(db, args.businessId)
  },
})

type RuntimeDocument = Record<string, unknown> & { _id: string }

type RuntimeIndexBuilder = {
  eq: (field: string, value: unknown) => RuntimeIndexBuilder
}

type RuntimeQuery = {
  withIndex: (indexName: string, callback: (query: RuntimeIndexBuilder) => RuntimeIndexBuilder) => RuntimeQuery
  collect: () => Promise<RuntimeDocument[]>
  unique: () => Promise<RuntimeDocument | null>
}

type RuntimeDb = {
  query: (tableName: string) => RuntimeQuery
  get: (id: string) => Promise<RuntimeDocument | null>
}

type RuntimeQueryCtx = {
  db: RuntimeDb
}

type CatalogDto = {
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  postcode?: string
  publicUrl: string
  trustTier: string
  publicStatus: 'published'
  indexStatus: 'not_queued' | 'queued' | 'indexed' | 'failed' | 'stale'
  discoveryStatus: 'unavailable' | 'degraded' | 'available' | 'stale'
  schemaVersion: 'public-business-catalog-api:v1'
  updatedAt: number
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
  kind: string
  status: string
}

type QueryInput = {
  cursor?: string
  limit?: number
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

async function readPublicCatalogs(db: RuntimeDb): Promise<CatalogDto[]> {
  const businesses = await db
    .query('businesses')
    .withIndex('by_publicStatus_slug', (query) => query.eq('publicStatus', 'published'))
    .collect()
  const catalogs: CatalogDto[] = []
  for (const business of businesses) {
    if (await hasActiveBusinessSuppression(db, business._id)) {
      continue
    }

    const catalog = await catalogForBusiness(db, business)
    if (catalog !== undefined) {
      catalogs.push(catalog)
    }
  }
  return catalogs.sort((left, right) => left.slug.localeCompare(right.slug))
}

async function catalogForBusiness(db: RuntimeDb, business: RuntimeDocument): Promise<CatalogDto | undefined> {
  const context = await db
    .query('businessContexts')
    .withIndex('by_business', (query) => query.eq('businessId', business._id))
    .unique()
  if (context === null) {
    return undefined
  }

  const services = await db
    .query('businessServices')
    .withIndex('by_business_status', (query) => query.eq('businessId', business._id).eq('status', 'published'))
    .collect()
  if (services.length === 0) {
    return undefined
  }

  const capabilities = await db
    .query('serviceCapabilities')
    .withIndex('by_business_service_status', (query) => query.eq('businessId', business._id))
    .collect()
  return {
    slug: stringField(business, 'slug'),
    name: stringField(business, 'name'),
    category: stringField(context, 'category'),
    suburb: stringField(context, 'suburb'),
    stateTerritory: stringField(context, 'stateTerritory'),
    ...(optionalStringField(context, 'postcode') === undefined ? {} : { postcode: stringField(context, 'postcode') }),
    publicUrl: `/${stringField(business, 'slug')}`,
    trustTier: stringField(business, 'trustTier'),
    publicStatus: 'published',
    indexStatus: await indexStatusForBusiness(db, business._id),
    discoveryStatus: await discoveryStatusForBusiness(db, business._id, stringField(business, 'sourceHash')),
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: numberField(business, 'updatedAt'),
    services: services
      .sort((left, right) => numberField(left, 'sortOrder') - numberField(right, 'sortOrder'))
      .map((service) => toServiceDto(service, capabilities)),
  }
}

function toServiceDto(service: RuntimeDocument, capabilities: readonly RuntimeDocument[]): ServiceDto {
  const serviceCapabilities = capabilities.filter((capability) => stringField(capability, 'serviceId') === service._id)
  const firstCapability = serviceCapabilities.at(0)
  return {
    slug: stringField(service, 'serviceSlug'),
    name: stringField(service, 'name'),
    category: stringField(service, 'category'),
    summary: stringField(service, 'summary'),
    serviceArea: stringField(service, 'serviceArea'),
    hoursOrUnknown: stringField(service, 'hoursOrUnknown'),
    firstRequest: firstCapability === undefined ? unavailableFirstRequest() : toFirstRequestDto(firstCapability),
    status: 'published',
    capabilities: serviceCapabilities.map((capability) => ({
      kind: stringField(capability, 'kind'),
      status: stringField(capability, 'status'),
    })),
  }
}

function toFirstRequestDto(capability: RuntimeDocument): FirstRequestDto {
  return {
    mode: firstRequestMode(capability),
    publicDisclosure: stringField(capability, 'publicDisclosure'),
    publicChannel: publicChannel(capability),
    ...(optionalStringField(capability, 'noContactReason') === undefined ? {} : { noContactReason: stringField(capability, 'noContactReason') }),
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

function paginateCatalogs(items: readonly CatalogDto[], input: QueryInput, query?: string) {
  const limit = normalizeLimit(input.limit)
  const startIndex = input.cursor === undefined ? 0 : Math.max(items.findIndex((item) => item.slug === input.cursor), 0)
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
      total: items.length,
      hasMore: next !== undefined,
    },
  }
}

async function readCatalogHealthFromDb(db: RuntimeDb, businessId: string) {
  const business = await db.get(businessId)
  const sourceState: 'published' | 'not_public' =
    business !== null && stringField(business, 'publicStatus') === 'published' && (await publishedServiceCount(db, businessId)) > 0
      ? 'published'
      : 'not_public'
  const latestAttempt = await latestRegistryAttempt(db, businessId)
  return {
    businessId,
    sourceState,
    ...(latestAttempt === undefined ? {} : { latestAttempt }),
    indexStatus: await indexStatusForBusiness(db, businessId),
    projectionItems: await projectionItemsForBusiness(db, businessId),
    affectedPublicSurfaces: ['/registry', '/api/businesses', '/api/businesses/search', '/api/businesses/{slug}'],
    repairAction: latestAttempt?.repairAction ?? (sourceState === 'published' ? 'rebuild_projection' : 'no_repair'),
    repairResult: latestAttempt?.repairResult ?? 'not_run',
  }
}

async function latestRegistryAttempt(db: RuntimeDb, businessId: string): Promise<RegistryAttempt | undefined> {
  const attempts = await db
    .query('registryProjectionAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId))
    .collect()
  const latest = attempts.sort((left, right) => numberField(right, 'startedAt') - numberField(left, 'startedAt')).at(0)
  return latest === undefined ? undefined : toRegistryAttempt(latest)
}

function toRegistryAttempt(attempt: RuntimeDocument): RegistryAttempt {
  return {
    businessId: stringField(attempt, 'businessId'),
    ...(optionalStringField(attempt, 'serviceId') === undefined ? {} : { serviceId: stringField(attempt, 'serviceId') }),
    logicalKey: stringField(attempt, 'logicalKey'),
    projectionKind: stringField(attempt, 'projectionKind') === 'service_catalog' ? 'service_catalog' : 'business_catalog',
    sourceHash: stringField(attempt, 'sourceHash'),
    sourceVersion: 'public-catalog:v1',
    status: registryStatus(attempt),
    retryCount: numberField(attempt, 'retryCount'),
    ...(optionalNumberField(attempt, 'retryAfter') === undefined ? {} : { retryAfter: numberField(attempt, 'retryAfter') }),
    ...(optionalStringField(attempt, 'lastErrorCode') === undefined ? {} : { lastErrorCode: stringField(attempt, 'lastErrorCode') }),
    ...(optionalStringField(attempt, 'lastErrorRedacted') === undefined ? {} : { lastErrorRedacted: stringField(attempt, 'lastErrorRedacted') }),
    startedAt: numberField(attempt, 'startedAt'),
    ...(optionalNumberField(attempt, 'finishedAt') === undefined ? {} : { finishedAt: numberField(attempt, 'finishedAt') }),
    ...(optionalNumberField(attempt, 'staleThresholdAt') === undefined ? {} : { staleThresholdAt: numberField(attempt, 'staleThresholdAt') }),
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
    ...(optionalStringField(item, 'serviceId') === undefined ? {} : { serviceId: stringField(item, 'serviceId') }),
    logicalKey: stringField(item, 'logicalKey'),
    projectionKind: stringField(item, 'projectionKind') === 'service_catalog' ? 'service_catalog' as const : 'business_catalog' as const,
    publicStatus: 'published' as const,
    sourceHash: stringField(item, 'sourceHash'),
    sourceVersion: 'public-catalog:v1' as const,
    generatedHash: stringField(item, 'generatedHash'),
    publicUrl: stringField(item, 'publicUrl'),
    serviceCount: numberField(item, 'serviceCount'),
    updatedAt: numberField(item, 'updatedAt'),
  }))
}

async function hasActiveBusinessSuppression(db: RuntimeDb, businessId: string): Promise<boolean> {
  const suppression = await db
    .query('suppressionRules')
    .withIndex('by_target_status', (query) => query.eq('targetType', 'business').eq('targetRef', businessId).eq('status', 'active'))
    .unique()
  return suppression !== null
}

async function publishedServiceCount(db: RuntimeDb, businessId: string): Promise<number> {
  const services = await db
    .query('businessServices')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId).eq('status', 'published'))
    .collect()
  return services.length
}

async function indexStatusForBusiness(db: RuntimeDb, businessId: string): Promise<CatalogDto['indexStatus']> {
  const statuses = await db.query('indexStatus').collect()
  const status = statuses.find(
    (candidate) => stringField(candidate, 'targetType') === 'business' && stringField(candidate, 'targetRef') === businessId
  )
  const value = status === undefined ? undefined : stringField(status, 'status')
  return value === 'queued' || value === 'indexed' || value === 'failed' || value === 'stale' ? value : 'not_queued'
}

async function discoveryStatusForBusiness(db: RuntimeDb, businessId: string, sourceHash: string): Promise<CatalogDto['discoveryStatus']> {
  const attempts = await db
    .query('discoveryManifestAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId))
    .collect()
  const latest = attempts.sort((left, right) => numberField(right, 'startedAt') - numberField(left, 'startedAt')).at(0)
  if (latest === undefined) {
    return 'degraded'
  }
  if (stringField(latest, 'sourceHash') !== sourceHash || stringField(latest, 'status') === 'stale') {
    return 'stale'
  }
  return stringField(latest, 'status') === 'succeeded' ? 'available' : 'degraded'
}

function matchesCatalog(catalog: CatalogDto, queryTokens: readonly string[]): boolean {
  const haystack = normalizeSearchText(
    [
      catalog.name,
      catalog.category,
      catalog.suburb,
      catalog.stateTerritory,
      catalog.postcode ?? '',
      ...catalog.services.flatMap((service) => [service.name, service.category, service.summary, service.serviceArea]),
    ].join(' ')
  )
  return queryTokens.every((token) => haystack.includes(token))
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

function optionalStringField(document: RuntimeDocument, field: string): string | undefined {
  const value = document[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(document: RuntimeDocument, field: string): number {
  const value = document[field]
  return typeof value === 'number' ? value : 0
}

function optionalNumberField(document: RuntimeDocument, field: string): number | undefined {
  const value = document[field]
  return typeof value === 'number' ? value : undefined
}

function firstRequestMode(document: RuntimeDocument): FirstRequestDto['mode'] {
  const value = stringField(document, 'firstRequestMode')
  if (value === 'inquiry_available' || value === 'quote_request_available' || value === 'not_available_yet') {
    return value
  }
  return 'not_available_yet'
}

function publicChannel(document: RuntimeDocument): FirstRequestDto['publicChannel'] {
  const value = stringField(document, 'publicChannel')
  if (value === 'public_business_contact' || value === 'ae_status_only' || value === 'not_available') {
    return value
  }
  return 'not_available'
}

function registryStatus(document: RuntimeDocument): RegistryAttempt['status'] {
  const value = stringField(document, 'status')
  if (value === 'queued' || value === 'succeeded' || value === 'failed' || value === 'stale') {
    return value
  }
  return 'queued'
}

function registryRepairAction(document: RuntimeDocument): RegistryAttempt['repairAction'] {
  const value = stringField(document, 'repairAction')
  if (value === 'retry_projection' || value === 'rebuild_projection' || value === 'no_repair') {
    return value
  }
  return 'no_repair'
}

function repairResult(document: RuntimeDocument): RegistryAttempt['repairResult'] {
  const value = stringField(document, 'repairResult')
  if (value === 'not_run' || value === 'succeeded' || value === 'failed') {
    return value
  }
  return 'not_run'
}

export type { IndexStatus, RegistryProjectionAttemptContract } from '../src/modules/registry/public'
