import { paginationOptsValidator, queryGeneric } from 'convex/server'
import type { DatabaseReader } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { v, type Infer } from 'convex/values'

import { offeringPriceCeilingMinor } from '../src/modules/catalog/public'
import type { BusinessSupplyProjection } from '../src/modules/catalog/public'
import { projectBusinessSupplyToPublicApi } from '../src/modules/registry/public'
import { canonicalTradeToken, TRADE_CANONICAL_TOKENS, TRADE_WORDS } from '../src/modules/registry/public'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import { normalizeSearchText } from '../src/modules/common/normalize-search-text'
import { readBusinessSupplyProjectionSnapshot } from './businessSupplyProjectionSnapshot'
import { hasActiveBusinessSuppression } from './catalogRuntimeQueries'

const inquiryTargetResolution = v.union(
  v.object({ kind: v.literal('resolved'), businessId: v.string(), offeringRef: v.string() }),
  v.object({ kind: v.literal('not_found'), reason: v.string() }),
)

const registryAttemptResult = v.object({
  businessId: v.string(), offeringRef: v.optional(v.string()), logicalKey: v.string(),
  projectionKind: v.union(v.literal('business_catalog'), v.literal('offering_catalog')),
  sourceHash: v.string(), sourceVersion: v.literal('public-catalog:v1'),
  status: v.union(v.literal('queued'), v.literal('succeeded'), v.literal('failed'), v.literal('stale')),
  retryCount: v.number(), retryAfter: v.optional(v.number()), lastErrorCode: v.optional(v.string()), lastErrorRedacted: v.optional(v.string()),
  startedAt: v.number(), finishedAt: v.optional(v.number()), staleThresholdAt: v.optional(v.number()),
  repairAction: v.union(v.literal('retry_projection'), v.literal('rebuild_projection'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const projectionItemResult = v.object({
  businessId: v.string(), offeringRef: v.optional(v.string()), logicalKey: v.string(),
  projectionKind: v.union(v.literal('business_catalog'), v.literal('offering_catalog')),
  publicStatus: v.literal('published'), sourceHash: v.string(), sourceVersion: v.literal('public-catalog:v1'),
  generatedHash: v.string(), publicUrl: v.string(), offeringCount: v.number(), updatedAt: v.number(),
})

const healthResult = v.object({
  businessId: v.string(), sourceState: v.union(v.literal('published'), v.literal('not_public')),
  latestAttempt: v.optional(registryAttemptResult),
  indexStatus: v.union(v.literal('not_queued'), v.literal('queued'), v.literal('indexed'), v.literal('failed'), v.literal('stale')),
  projectionItems: v.array(projectionItemResult), affectedPublicSurfaces: v.array(v.string()),
  repairAction: v.union(v.literal('retry_projection'), v.literal('rebuild_projection'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const offeringPriceDto = v.object({
  kind: v.union(v.literal('fixed'), v.literal('from'), v.literal('range'), v.literal('quote_only')),
  currency: v.string(), amountMinor: v.optional(v.number()), maximumAmountMinor: v.optional(v.number()),
  unit: v.optional(v.union(v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
  taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
})
const offeringAccessPathDto = v.union(
  v.object({ accessPathRef: v.string(), kind: v.literal('human_request'), channel: v.union(v.literal('phone'), v.literal('website'), v.literal('ae_inquiry')), disclosure: v.string(), url: v.optional(v.string()) }),
  v.object({ accessPathRef: v.string(), kind: v.literal('external_operation'), name: v.string(), summary: v.string(), url: v.string(), method: v.optional(v.string()), documentationUrl: v.optional(v.string()), interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })), authenticationSummary: v.optional(v.string()), pricingSummary: v.optional(v.string()), provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')) }),
)
const offeringDto = v.object({
  offeringRef: v.string(), revision: v.number(), name: v.string(), category: v.string(), summary: v.string(),
  serviceAreaSummary: v.optional(v.string()), availabilitySummary: v.optional(v.string()), pricingSummary: v.optional(v.string()), price: v.optional(offeringPriceDto),
  accessPaths: v.array(offeringAccessPathDto), support: v.object({ integrated: v.boolean(), aeSupportedAction: v.boolean(), observedAt: v.optional(v.number()), validUntil: v.optional(v.number()) }),
})
const offeringBusinessDto = v.object({
  schemaVersion: v.literal('public-business-catalog-api:v2'), businessId: v.string(), slug: v.string(), name: v.string(), category: v.string(), suburb: v.string(), stateTerritory: v.string(),
  publishedPhone: v.optional(v.string()), postcode: v.optional(v.string()), publicUrl: v.string(), trustTier: v.union(v.literal('claimed'), v.literal('contact_confirmed'), v.literal('listed'), v.literal('registry_verified')),
  responseTimeMinutes: v.optional(v.number()), photos: v.array(v.object({ url: v.string(), alt: v.string() })), observedAt: v.number(), disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
  offerings: v.array(offeringDto), accessSummary: v.object({ humanRequest: v.boolean(), externalOperation: v.boolean(), aeSupportedAction: v.boolean() }),
})
const offeringPageResult = v.object({
  kind: v.literal('ok'), schemaVersion: v.literal('public-business-catalog-api:v2'), query: v.optional(v.string()), items: v.array(offeringBusinessDto),
  pagination: v.object({ cursor: v.optional(v.string()), nextCursor: v.optional(v.string()), limit: v.number(), total: v.number(), hasMore: v.boolean() }),
})
const nativeOfferingPageResult = v.object({ kind: v.literal('ok'), schemaVersion: v.literal('public-business-catalog-api:v2'), page: v.array(offeringBusinessDto), isDone: v.boolean(), continueCursor: v.string() })
const offeringDetailResult = v.union(
  v.object({ kind: v.literal('found'), schemaVersion: v.literal('public-business-catalog-api:v2'), business: offeringBusinessDto }),
  v.object({ kind: v.literal('not_found'), code: v.literal('business_not_found'), reason: v.string() }),
)

const paginationArgs = { paginationOpts: paginationOptsValidator }

export const listPublicBusinessOfferingSupply = queryGeneric({
  args: paginationArgs, returns: nativeOfferingPageResult,
  handler: async (ctx, args) => nativeOfferingPageResultValue(await readOfferingSupplyPage(ctx.db, args.paginationOpts)),
})

export const searchPublicBusinessOfferingSupply = queryGeneric({
  args: {
    query: v.string(), mode: v.optional(v.union(v.literal('near_me'), v.literal('whole_catalogue'))), location: v.optional(v.string()),
    maxPriceMinor: v.optional(v.number()), hasPrice: v.optional(v.boolean()), cursor: v.optional(v.string()), limit: v.optional(v.number()),
  }, returns: offeringPageResult,
  handler: async (ctx, args) => {
    const needle = normalizeSearchText(args.query)
    const input = queryInput(args)
    if (needle.length === 0) return paginateOfferingSupply([], input, '')
    const tokens = needle.split(' ').filter((token) => !SEARCH_STOP_WORDS.has(token)).map(canonicalTradeToken)
    const locationKey = resolveSearchLocationKey(args)
    const searchText = tokens.length === 0 ? needle : tokens.join(' ')
    const documents = await ctx.db.query('registrySearchDocuments')
      .withSearchIndex('search_searchText_by_publicStatus', (search) => search.search('searchText', searchText).eq('publicStatus', 'published'))
      .take(SEARCH_DOCUMENT_CANDIDATE_LIMIT)
    const candidateSlugs = uniqueBusinessSlugs(documents.filter((document) => matchesSearchDocument(document, tokens, locationKey))).slice(0, SEARCH_HYDRATION_BUSINESS_LIMIT)
    const businesses = (await Promise.all(candidateSlugs.map((slug) => ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', slug)).unique()))).filter((business): business is Doc<'businesses'> => business !== null)
    const offeringSupplyReadPort = createOfferingSupplyReadPort(ctx.db)
    const supply = (await Promise.all(businesses.map((business) => readOfferingSupplyForBusiness(offeringSupplyReadPort, business)))).filter((item): item is OfferingSupplyDto => item !== undefined).filter((item) => matchesOfferingSupply(item, tokens, locationKey))
    const items = filterOfferingSupplyByPrice(supply, args).slice().sort((left, right) => left.slug.localeCompare(right.slug))
    return paginateOfferingSupply(items, input, needle)
  },
})

export const getPublicBusinessOfferingSupplyBySlug = queryGeneric({
  args: { slug: v.string() }, returns: offeringDetailResult,
  handler: async (ctx, args) => {
    const business = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug))).unique()
    if (business === null || business.publicStatus !== 'published') return { kind: 'not_found' as const, code: 'business_not_found' as const, reason: 'No public business catalog exists for this slug.' }
    const item = await readOfferingSupplyForBusiness(createOfferingSupplyReadPort(ctx.db), business)
    return item === undefined
      ? { kind: 'not_found' as const, code: 'business_not_found' as const, reason: 'No current public Offering projection exists for this business.' }
      : { kind: 'found' as const, schemaVersion: 'public-business-catalog-api:v2' as const, business: toConvexOfferingBusiness(item) }
  },
})

export const resolvePublishedInquiryTargetBySlug = queryGeneric({
  args: { businessSlug: v.string(), offeringRef: v.string() }, returns: inquiryTargetResolution,
  handler: async (ctx, args) => resolvePublishedInquiryTargetFromDb(ctx.db, normalizeSlug(args.businessSlug), args.offeringRef),
})

export const readCatalogHealth = queryGeneric({
  args: { businessId: v.string() }, returns: healthResult,
  handler: async (ctx, args) => readCatalogHealthFromDb(ctx.db, args.businessId),
})

type QueryInput = { cursor?: string; limit?: number }
type NativePaginationOpts = typeof paginationOptsValidator['type']
type OfferingSupplyDto = ReturnType<typeof projectBusinessSupplyToPublicApi>
type ConvexOfferingAccessPathDto = Infer<typeof offeringAccessPathDto>
type ConvexOfferingDto = Infer<typeof offeringDto>
type ConvexOfferingBusinessDto = Infer<typeof offeringBusinessDto>
type RegistryAttempt = {
  businessId: string; offeringRef?: string; logicalKey: string; projectionKind: 'business_catalog' | 'offering_catalog'; sourceHash: string; sourceVersion: 'public-catalog:v1';
  status: 'queued' | 'succeeded' | 'failed' | 'stale'; retryCount: number; retryAfter?: number; lastErrorCode?: string; lastErrorRedacted?: string; startedAt: number; finishedAt?: number; staleThresholdAt?: number;
  repairAction: 'retry_projection' | 'rebuild_projection' | 'no_repair'; repairResult: 'not_run' | 'succeeded' | 'failed'
}
type OfferingPage = { items: OfferingSupplyDto[]; isDone: boolean; continueCursor: string }
type CatalogHealth = { businessId: string; sourceState: 'published' | 'not_public'; latestAttempt?: RegistryAttempt; indexStatus: 'not_queued' | 'queued' | 'indexed' | 'failed' | 'stale'; projectionItems: ReturnType<typeof projectionItemValue>[]; affectedPublicSurfaces: string[]; repairAction: 'retry_projection' | 'rebuild_projection' | 'no_repair'; repairResult: 'not_run' | 'succeeded' | 'failed' }
export type OfferingSupplyBusiness = Readonly<{
  _id: string
  slug: string
  publicStatus?: string
}>

export type OfferingSupplySnapshot = Readonly<{
  status: 'current' | 'projection_pending'
  projection: BusinessSupplyProjection
}>

export type OfferingSupplyReadPort = Readonly<{
  hasActiveBusinessSuppression: (businessId: string) => Promise<boolean>
  readBusinessSupplyProjectionSnapshot: (businessId: string) => Promise<OfferingSupplySnapshot | null>
}>

function createOfferingSupplyReadPort(db: DatabaseReader): OfferingSupplyReadPort {
  return {
    hasActiveBusinessSuppression: async (businessId) => {
      const normalizedId = db.normalizeId('businesses', businessId)
      return normalizedId === null ? false : hasActiveBusinessSuppression(db, normalizedId)
    },
    readBusinessSupplyProjectionSnapshot: async (businessId) => {
      const normalizedId = db.normalizeId('businesses', businessId)
      if (normalizedId === null) return null
      const snapshot = await db.query('businessSupplyProjectionSnapshots')
        .withIndex('by_businessId', (query) => query.eq('businessId', normalizedId))
        .unique()
      if (snapshot === null || snapshot.projection === undefined) return null
      const status = snapshot.status
      if (status !== 'current' && status !== 'projection_pending') return null
      return { status, projection: readBusinessSupplyProjectionSnapshot(snapshot.projection, 'registry') }
    },
  }
}


export async function readOfferingSupplyForBusiness(
  port: OfferingSupplyReadPort,
  business: OfferingSupplyBusiness,
): Promise<OfferingSupplyDto | undefined> {
  if (business.publicStatus !== 'published') return undefined
  if (await port.hasActiveBusinessSuppression(business._id)) return undefined
  const snapshot = await port.readBusinessSupplyProjectionSnapshot(business._id)
  if (snapshot === null) return undefined
  const projection = snapshot.projection
  if (String(projection.business.businessId) !== String(business._id) || projection.business.slug !== business.slug) return undefined
  const projected = projectBusinessSupplyToPublicApi(projection, Date.now())
  return snapshot.status === 'projection_pending' ? { ...projected, disposition: 'stale' } : projected
}
const SEARCH_DOCUMENT_CANDIDATE_LIMIT = 250
const SEARCH_HYDRATION_BUSINESS_LIMIT = 100

function queryInput(args: { cursor?: string; limit?: number }): QueryInput { return { ...(args.cursor === undefined ? {} : { cursor: args.cursor }), ...(args.limit === undefined ? {} : { limit: args.limit }) } }


async function readOfferingSupplyPage(db: DatabaseReader, paginationOpts: NativePaginationOpts): Promise<OfferingPage> {
  const page = await db.query('businesses').withIndex('by_publicStatus_slug', (query) => query.eq('publicStatus', 'published')).paginate(paginationOpts)
  const offeringSupplyReadPort = createOfferingSupplyReadPort(db)
  const items = (await Promise.all(page.page.map((business) => readOfferingSupplyForBusiness(offeringSupplyReadPort, business)))).filter((item): item is OfferingSupplyDto => item !== undefined)
  return { items, isDone: page.isDone, continueCursor: page.continueCursor }
}

function nativeOfferingPageResultValue(page: OfferingPage) { return { kind: 'ok' as const, schemaVersion: 'public-business-catalog-api:v2' as const, page: page.items.map(toConvexOfferingBusiness), isDone: page.isDone, continueCursor: page.continueCursor } }

function toConvexOfferingAccessPath(path: OfferingSupplyDto['offerings'][number]['accessPaths'][number]): ConvexOfferingAccessPathDto {
  if (path.kind === 'human_request') return { accessPathRef: path.accessPathRef, kind: 'human_request', channel: path.channel, disclosure: path.disclosure, ...(path.url === undefined ? {} : { url: path.url }) }
  const interfaceDescription = path.interfaceDescription === undefined ? undefined : { format: path.interfaceDescription.format, ...(path.interfaceDescription.url === undefined ? {} : { url: path.interfaceDescription.url }) }
  return { accessPathRef: path.accessPathRef, kind: 'external_operation', name: path.name, summary: path.summary, url: path.url, ...(path.method === undefined ? {} : { method: path.method }), ...(path.documentationUrl === undefined ? {} : { documentationUrl: path.documentationUrl }), ...(interfaceDescription === undefined ? {} : { interfaceDescription }), ...(path.authenticationSummary === undefined ? {} : { authenticationSummary: path.authenticationSummary }), ...(path.pricingSummary === undefined ? {} : { pricingSummary: path.pricingSummary }), provenance: path.provenance }
}

function toConvexOffering(offering: OfferingSupplyDto['offerings'][number]): ConvexOfferingDto {
  const price = offering.price === undefined ? undefined : { ...offering.price }
  return { offeringRef: offering.offeringRef, revision: offering.revision, name: offering.name, category: offering.category, summary: offering.summary, ...(offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: offering.serviceAreaSummary }), ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: offering.availabilitySummary }), ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }), ...(price === undefined ? {} : { price }), accessPaths: offering.accessPaths.map(toConvexOfferingAccessPath), support: { integrated: offering.support.integrated, aeSupportedAction: offering.support.aeSupportedAction, ...(offering.support.observedAt === undefined ? {} : { observedAt: offering.support.observedAt }), ...(offering.support.validUntil === undefined ? {} : { validUntil: offering.support.validUntil }) } }
}

function toConvexOfferingBusiness(item: OfferingSupplyDto): ConvexOfferingBusinessDto {
  return { schemaVersion: item.schemaVersion, businessId: item.businessId, slug: item.slug, name: item.name, category: item.category, suburb: item.suburb, stateTerritory: item.stateTerritory, ...(item.publishedPhone === undefined ? {} : { publishedPhone: item.publishedPhone }), ...(item.postcode === undefined ? {} : { postcode: item.postcode }), publicUrl: item.publicUrl, trustTier: item.trustTier, ...(item.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: item.responseTimeMinutes }), photos: item.photos.map((photo) => ({ url: photo.url, alt: photo.alt })), observedAt: item.observedAt, disposition: item.disposition, offerings: item.offerings.map(toConvexOffering), accessSummary: { humanRequest: item.accessSummary.humanRequest, externalOperation: item.accessSummary.externalOperation, aeSupportedAction: item.accessSummary.aeSupportedAction } }
}

function filterOfferingSupplyByPrice(items: readonly OfferingSupplyDto[], args: { maxPriceMinor?: number; hasPrice?: boolean }): readonly OfferingSupplyDto[] {
  const budgetMinor = Number.isInteger(args.maxPriceMinor) && (args.maxPriceMinor ?? 0) > 0 ? args.maxPriceMinor : undefined
  if (budgetMinor === undefined && args.hasPrice !== true) return items
  return items.filter((item) => { if (args.hasPrice === true && !item.offerings.some((offering) => offering.price !== undefined)) return false; if (budgetMinor === undefined) return true; return !item.offerings.every((offering) => { const ceilingMinor = offeringPriceCeilingMinor(offering.price); return ceilingMinor !== undefined && ceilingMinor > budgetMinor }) })
}

function paginateOfferingSupply(items: readonly OfferingSupplyDto[], input: QueryInput, query?: string) {
  const limit = normalizeLimit(input.limit)
  const startIndex = input.cursor === undefined ? 0 : Math.max(items.findIndex((item) => item.slug === input.cursor), 0)
  const pageItems = items.slice(startIndex, startIndex + limit).map(toConvexOfferingBusiness)
  const next = items.at(startIndex + limit)
  return { kind: 'ok' as const, schemaVersion: 'public-business-catalog-api:v2' as const, ...(query === undefined ? {} : { query }), items: pageItems, pagination: { ...(input.cursor === undefined ? {} : { cursor: input.cursor }), ...(next === undefined ? {} : { nextCursor: next.slug }), limit, total: items.length, hasMore: next !== undefined } }
}

async function resolvePublishedInquiryTargetFromDb(db: DatabaseReader, businessSlug: string, offeringRef: string): Promise<{ kind: 'resolved'; businessId: string; offeringRef: string } | { kind: 'not_found'; reason: string }> {
  const business = await db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', businessSlug)).unique()
  if (business === null || business.publicStatus !== 'published') return { kind: 'not_found', reason: 'No published business is discoverable for this slug.' }
  const item = await readOfferingSupplyForBusiness(createOfferingSupplyReadPort(db), business)
  const offering = item?.offerings.find((candidate) => candidate.offeringRef === offeringRef)
  if (item === undefined || offering === undefined) return { kind: 'not_found', reason: 'No published Offering is discoverable for this reference on the business.' }
  return { kind: 'resolved', businessId: item.businessId, offeringRef: offering.offeringRef }
}

function matchesOfferingSupply(item: OfferingSupplyDto, tokens: readonly string[], locationKey: string | undefined): boolean {
  if (locationKey !== undefined && !offeringPlaceKeys(item).includes(locationKey)) return false
  const haystack = normalizeSearchText([item.slug, item.name, item.category, item.suburb, item.stateTerritory, item.postcode ?? '', ...item.offerings.flatMap((offering) => [offering.name, offering.category, offering.summary, offering.serviceAreaSummary ?? ''])].join(' '))
  return matchesQueryTokens(haystack, tokens.length === 0 ? [item.slug] : tokens)
}

function matchesSearchDocument(document: Doc<'registrySearchDocuments'>, tokens: readonly string[], locationKey: string | undefined): boolean {
  if (locationKey !== undefined && !document.placeKeys.includes(locationKey)) return false
  return matchesQueryTokens(document.searchText, tokens.length === 0 ? [document.searchText] : tokens)
}

function uniqueBusinessSlugs(documents: readonly Doc<'registrySearchDocuments'>[]): string[] {
  const slugs = new Set<string>()
  for (const document of documents) if (document.businessSlug.length > 0) slugs.add(document.businessSlug)
  return [...slugs]
}

function offeringPlaceKeys(item: OfferingSupplyDto): readonly string[] {
  const keys = new Set<string>()
  addPlaceKey(keys, item.suburb)
  addPlaceKey(keys, `${item.suburb} ${item.stateTerritory}`)
  addPlaceKey(keys, item.stateTerritory)
  if (item.postcode !== undefined) addPlaceKey(keys, item.postcode)
  for (const offering of item.offerings) for (const candidate of extractPlaceCandidates(offering.serviceAreaSummary ?? '')) addPlaceKey(keys, candidate)
  return [...keys]
}

async function readCatalogHealthFromDb(db: DatabaseReader, businessId: string): Promise<CatalogHealth> {
  const id = db.normalizeId('businesses', businessId)
  const business = id === null ? null : await db.get(id)
  const snapshot = id === null || business === null
    ? null
    : await db.query('businessSupplyProjectionSnapshots')
      .withIndex('by_businessId', (query) => query.eq('businessId', id))
      .unique()
  const suppressed = id === null || business === null || business.publicStatus !== 'published'
    ? false
    : await hasActiveBusinessSuppression(db, id)
  const sourceState: CatalogHealth['sourceState'] = business !== null && business.publicStatus === 'published' && !suppressed && snapshot !== null ? 'published' : 'not_public'
  const latestAttempt = id === null ? undefined : await latestRegistryAttempt(db, id)
  return {
    businessId,
    sourceState,
    ...(latestAttempt === undefined ? {} : { latestAttempt }),
    indexStatus: await indexStatusForBusiness(db, businessId),
    projectionItems: id === null ? [] : await projectionItemsForBusiness(db, id),
    affectedPublicSurfaces: ['/api/businesses', '/api/businesses/search', '/api/businesses/{slug}'],
    repairAction: latestAttempt?.repairAction ?? (sourceState === 'published' ? 'rebuild_projection' : 'no_repair'),
    repairResult: latestAttempt?.repairResult ?? 'not_run',
  }
}

async function latestRegistryAttempt(db: DatabaseReader, businessId: Id<'businesses'>): Promise<RegistryAttempt | undefined> {
  const latest = await db.query('registryProjectionAttempts').withIndex('by_business_startedAt', (query) => query.eq('businessId', businessId)).order('desc').first()
  return latest === null ? undefined : toRegistryAttempt(latest)
}

function toRegistryAttempt(attempt: Doc<'registryProjectionAttempts'>): RegistryAttempt {
  return { businessId: String(attempt.businessId), ...(attempt.offeringRef === undefined ? {} : { offeringRef: attempt.offeringRef }), logicalKey: attempt.logicalKey, projectionKind: attempt.projectionKind, sourceHash: attempt.sourceHash, sourceVersion: attempt.sourceVersion, status: attempt.status, retryCount: attempt.retryCount, ...(attempt.retryAfter === undefined ? {} : { retryAfter: attempt.retryAfter }), ...(attempt.lastErrorCode === undefined ? {} : { lastErrorCode: attempt.lastErrorCode }), ...(attempt.lastErrorRedacted === undefined ? {} : { lastErrorRedacted: attempt.lastErrorRedacted }), startedAt: attempt.startedAt, ...(attempt.finishedAt === undefined ? {} : { finishedAt: attempt.finishedAt }), ...(attempt.staleThresholdAt === undefined ? {} : { staleThresholdAt: attempt.staleThresholdAt }), repairAction: attempt.repairAction, repairResult: attempt.repairResult }
}

function projectionItemValue(item: Doc<'registryProjectionItems'>) {
  return { businessId: String(item.businessId), ...(item.offeringRef === undefined ? {} : { offeringRef: item.offeringRef }), logicalKey: item.logicalKey, projectionKind: item.projectionKind, publicStatus: 'published' as const, sourceHash: item.sourceHash, sourceVersion: item.sourceVersion, generatedHash: item.generatedHash, publicUrl: item.publicUrl, offeringCount: item.offeringCount, updatedAt: item.updatedAt }
}

async function projectionItemsForBusiness(db: DatabaseReader, businessId: Id<'businesses'>) {
  const items = await db.query('registryProjectionItems').withIndex('by_business', (query) => query.eq('businessId', businessId)).take(100)
  return items.map(projectionItemValue)
}

async function indexStatusForBusiness(db: DatabaseReader, businessId: string): Promise<CatalogHealth['indexStatus']> {
  const status = await db.query('indexStatus').withIndex('by_target', (query) => query.eq('targetType', 'business').eq('targetRef', businessId)).first()
  return status?.status ?? 'not_queued'
}

const SEARCH_STOP_WORDS = new Set(['a', 'an', 'and', 'around', 'at', 'business', 'businesses', 'find', 'for', 'in', 'near', 'need', 'now', 'open', 'provider', 'providers', 'service', 'services', 'the', 'to'])
const SERVICE_WORDS = new Set([...SEARCH_STOP_WORDS, ...TRADE_WORDS, 'appointment', 'callout', 'cleaner', 'cleaners', 'day', 'dentist', 'dentists', 'diagnostic', 'diagnostics', 'electrician', 'electricians', 'emergency', 'heat', 'help', 'hot', 'locksmith', 'locksmiths', 'mechanic', 'mechanics', 'metro', 'plumber', 'plumbers', 'plumbing', 'pump', 'repair', 'repairs', 'same', 'suburb', 'suburbs', 'today', 'tomorrow', 'trade', 'trades', 'urgent', 'water', 'this', 'week', 'weeks'])
const STATE_WORDS = new Set(['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'])
const LOCATION_PREPOSITION = /\b(?:in|near|around|at)\s+([a-z][a-z\s'-]{1,80})(?:\?|$)/i

function matchesQueryTokens(haystack: string, tokens: readonly string[]): boolean { const tradeTokens = tokens.filter((token) => TRADE_CANONICAL_TOKENS.has(token)); if (tradeTokens.length > 0) return tradeTokens.some((token) => haystack.includes(token)); return tokens.every((token) => haystack.includes(token)) }
function resolveSearchLocationKey(input: { query: string; mode?: string; location?: string }): string | undefined { if (input.mode === 'whole_catalogue') return undefined; const explicit = normalizeLocationLabel(input.location); if (explicit !== undefined) return normalizeSearchText(explicit); const fromQuery = extractLocationFromQuery(input.query); return fromQuery === undefined ? undefined : normalizeSearchText(fromQuery) }
function extractLocationFromQuery(query: string): string | undefined { const normalized = normalizeLocationLabel(query); if (normalized === undefined) return undefined; const prepositionMatch = normalized.match(LOCATION_PREPOSITION); if (prepositionMatch?.[1] !== undefined) return normalizeLocationLabel(prepositionMatch[1]); const tokens = normalized.split(/\s+/).filter(Boolean); return normalizeLocationLabel(trimServiceWords(dropTrailingState(tokens)).join(' ')) }
function extractPlaceCandidates(value: string): readonly string[] { const normalized = normalizeSearchText(value); if (normalized.length === 0) return []; return normalized.replace(/\band nearby suburbs\b/g, '|').replace(/\bnearby suburbs\b/g, '|').replace(/\bmetro\b/g, ' metro|').split(/[|,;/]+/g).map((candidate) => trimServiceWords(candidate.split(/\s+/).filter(Boolean)).join(' ')).map((candidate) => candidate.replace(/\bmetro\b/g, '').trim()).filter((candidate) => candidate.length >= 3) }
function normalizeLocationLabel(value: string | undefined): string | undefined { if (value === undefined) return undefined; const words = value.trim().replace(/[^a-z0-9\s'-]+/gi, ' ').replace(/\s+/g, ' ').split(/\s+/).filter(Boolean).filter((word) => !STATE_WORDS.has(word.toLowerCase())); while (words.length > 0) { const first = words[0]; if (first === undefined || !SERVICE_WORDS.has(first.toLowerCase())) break; words.shift() } while (words.length > 0) { const last = words.at(-1); if (last === undefined || !SERVICE_WORDS.has(last.toLowerCase())) break; words.pop() } const label = words.join(' ').trim(); if (label.length < 3 || /\d/.test(label)) return undefined; return label }
function dropTrailingState(tokens: readonly string[]): readonly string[] { const last = tokens.at(-1)?.toLowerCase(); return last !== undefined && STATE_WORDS.has(last) ? tokens.slice(0, -1) : tokens }
function trimServiceWords(tokens: readonly string[]): readonly string[] { let start = 0; let end = tokens.length; while (start < end) { const token = tokens[start]; if (token === undefined || !SERVICE_WORDS.has(token.toLowerCase())) break; start += 1 } while (end > start) { const token = tokens[end - 1]; if (token === undefined || !SERVICE_WORDS.has(token.toLowerCase())) break; end -= 1 } return tokens.slice(start, end) }
function addPlaceKey(keys: Set<string>, value: string): void { const key = normalizeSearchText(value); if (key.length > 0) keys.add(key) }
function normalizeLimit(limit: number | undefined): number { if (limit === undefined || !Number.isFinite(limit)) return 20; return Math.min(Math.max(Math.trunc(limit), 1), 50) }

export type { IndexStatus, RegistryProjectionAttemptContract } from '../src/modules/registry/public'
