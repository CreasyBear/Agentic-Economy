import { paginationOptsValidator, queryGeneric } from 'convex/server'
import type { DatabaseReader } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { v, type Infer } from 'convex/values'

import { compareExactAmounts, type ExactAmount } from '../src/modules/money/public'
import { businessContext as businessContextDto } from '../src/modules/business/public'

import type { BusinessSupplyProjection } from '../src/modules/catalog/public'
import {
  projectBusinessSupplyToPublicApi,
  registrySearchTokens,
} from '../src/modules/registry/public'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import { normalizeSearchText } from '../src/modules/common/normalize-search-text'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  readLiveBusinessSupplyProjection,
} from './capabilitySupplyProjection'

const exactAmountDto = v.object({
  currency: v.string(), units: v.string(), exponent: v.number(),
})
const offeringPriceDto = v.union(
  v.object({
    kind: v.union(v.literal('fixed'), v.literal('from')), amount: exactAmountDto,
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
  v.object({
    kind: v.literal('range'), minimum: exactAmountDto, maximum: exactAmountDto,
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
  v.object({
    kind: v.literal('quote_only'), currency: v.string(),
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
)
const offeringAccessPathDto = v.union(
  v.object({
    accessPathRef: v.string(),
    offeringRevision: v.number(),
    kind: v.literal('human_request'),
    channel: v.union(v.literal('phone'), v.literal('website')),
    disclosure: v.string(),
    url: v.optional(v.string()),
  }),
  v.object({
    accessPathRef: v.string(),
    offeringRevision: v.number(),
    kind: v.literal('external_operation'),
    name: v.string(),
    summary: v.string(),
    url: v.string(),
    method: v.optional(v.string()),
    documentationUrl: v.optional(v.string()),
    interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
    authenticationSummary: v.optional(v.string()),
    pricingSummary: v.optional(v.string()),
    provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
  }),
)
const offeringDto = v.object({
  offeringRef: v.string(), revision: v.number(), name: v.string(), category: v.string(), summary: v.string(),
  serviceAreaSummary: v.optional(v.string()), availabilitySummary: v.optional(v.string()), pricingSummary: v.optional(v.string()), price: v.optional(offeringPriceDto),
  accessPaths: v.array(offeringAccessPathDto), support: v.object({ integrated: v.boolean(), aeSupportedAction: v.boolean(), observedAt: v.optional(v.number()), validUntil: v.optional(v.number()) }),
})
const offeringBusinessDto = v.object({
  schemaVersion: v.literal('public-business-catalog-api:v2'),
  businessId: v.string(),
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  businessContext: businessContextDto,
  publicUrl: v.string(),
  trustTier: v.union(v.literal('claimed'), v.literal('contact_confirmed'), v.literal('listed'), v.literal('registry_verified')),
  responseTimeMinutes: v.optional(v.number()),
  photos: v.array(v.object({ url: v.string(), alt: v.string() })),
  observedAt: v.number(),
  disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
  offerings: v.array(offeringDto),
  accessSummary: v.object({ humanRequest: v.boolean(), externalOperation: v.boolean(), aeSupportedAction: v.boolean() }),
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
    maxPrice: v.optional(exactAmountDto), hasPrice: v.optional(v.boolean()), cursor: v.optional(v.string()), limit: v.optional(v.number()),
  }, returns: offeringPageResult,
  handler: async (ctx, args) => {
    const needle = normalizeSearchText(args.query)
    const input = queryInput(args)
    const tokens = registrySearchTokens(needle)
    if (tokens.length === 0) return paginateOfferingSupply([], input, needle)
    const locationKey = resolveSearchLocationKey(args)
    const documents = await readMatchingSearchDocuments(ctx.db, tokens.join(' '), tokens, locationKey)
    const candidateSlugs = uniqueBusinessSlugs(documents)
    const businesses = (await Promise.all(candidateSlugs.map((slug) => ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', slug)).unique()))).filter((business): business is Doc<'businesses'> => business !== null)
    const offeringSupplyReadPort = createOfferingSupplyReadPort(ctx.db)
    const supply = (await Promise.all(businesses.map((business) => readOfferingSupplyForBusiness(offeringSupplyReadPort, business)))).filter((item): item is OfferingSupplyDto => item !== undefined && matchesOfferingSupply(item, tokens, locationKey))
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

type QueryInput = { cursor?: string; limit?: number }
type NativePaginationOpts = typeof paginationOptsValidator['type']
type OfferingSupplyDto = ReturnType<typeof projectBusinessSupplyToPublicApi>
type OfferingPage = { items: OfferingSupplyDto[]; isDone: boolean; continueCursor: string }
type ConvexOfferingAccessPathDto = Infer<typeof offeringAccessPathDto>
type ConvexOfferingDto = Infer<typeof offeringDto>
type ConvexOfferingBusinessDto = Infer<typeof offeringBusinessDto>
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
  readBusinessSupplyProjectionSnapshot: (businessId: string, expectedSlug?: string) => Promise<OfferingSupplySnapshot | null>
}>

function createOfferingSupplyReadPort(db: DatabaseReader): OfferingSupplyReadPort {
  return {
    readBusinessSupplyProjectionSnapshot: async (businessId, expectedSlug) => {
      const id = db.normalizeId('businesses', businessId)
      if (id === null) return null
      const now = Date.now()
      const support = await deriveBusinessOfferingSupportFromCapabilitySupply(db, id, now)
      const projection = await readLiveBusinessSupplyProjection({ db, businessId: id, support, now })
      if (projection === null) return null
      if (expectedSlug !== undefined && projection.business.slug !== expectedSlug) return null
      return { status: 'current', projection }
    },
  }
}


export async function readOfferingSupplyForBusiness(
  port: OfferingSupplyReadPort,
  business: OfferingSupplyBusiness,
): Promise<OfferingSupplyDto | undefined> {
  if (business.publicStatus !== 'published') return undefined
  const snapshot = await port.readBusinessSupplyProjectionSnapshot(business._id, business.slug)
  if (snapshot === null) return undefined
  const projection = snapshot.projection
  if (String(projection.business.businessId) !== String(business._id) || projection.business.slug !== business.slug) return undefined
  const projected = projectBusinessSupplyToPublicApi(projection, Date.now())
  if (projected.offerings.length === 0) return undefined
  return snapshot.status === 'projection_pending' ? { ...projected, disposition: 'stale' } : projected
}
const SEARCH_DOCUMENT_PAGE_SIZE = 250

async function readMatchingSearchDocuments(
  db: DatabaseReader,
  searchText: string,
  tokens: readonly string[],
  locationKey: string | undefined,
): Promise<Doc<'registrySearchDocuments'>[]> {
  const documents: Doc<'registrySearchDocuments'>[] = []
  let cursor: string | null = null
  for (;;) {
    const page = await db.query('registrySearchDocuments')
      .withSearchIndex('search_searchText_by_publicStatus', (search) => search.search('searchText', searchText).eq('publicStatus', 'published'))
      .paginate({ cursor, numItems: SEARCH_DOCUMENT_PAGE_SIZE })
    documents.push(...page.page.filter((document) => matchesSearchDocument(document, tokens, locationKey)))
    if (page.isDone) return documents
    if (page.continueCursor === cursor) throw new Error('registry_search_cursor_stalled')
    cursor = page.continueCursor
  }
}


function queryInput(args: { cursor?: string; limit?: number }): QueryInput { return { ...(args.cursor === undefined ? {} : { cursor: args.cursor }), ...(args.limit === undefined ? {} : { limit: args.limit }) } }


export async function readOfferingSupplyPage(db: DatabaseReader, paginationOpts: NativePaginationOpts): Promise<OfferingPage> {
  const page = await db.query('businesses').withIndex('by_publicStatus_slug', (query) => query.eq('publicStatus', 'published')).paginate(paginationOpts)
  const offeringSupplyReadPort = createOfferingSupplyReadPort(db)
  const items = (await Promise.all(page.page.map((business) => readOfferingSupplyForBusiness(offeringSupplyReadPort, business)))).filter((item): item is OfferingSupplyDto => item !== undefined)
  return { items, isDone: page.isDone, continueCursor: page.continueCursor }
}

function nativeOfferingPageResultValue(page: OfferingPage) { return { kind: 'ok' as const, schemaVersion: 'public-business-catalog-api:v2' as const, page: page.items.map(toConvexOfferingBusiness), isDone: page.isDone, continueCursor: page.continueCursor } }

function toConvexOfferingAccessPath(path: OfferingSupplyDto['offerings'][number]['accessPaths'][number]): ConvexOfferingAccessPathDto {
  if (path.kind === 'human_request') {
    return {
      accessPathRef: path.accessPathRef,
      offeringRevision: path.offeringRevision,
      kind: 'human_request',
      channel: path.channel,
      disclosure: path.disclosure,
      ...(path.url === undefined ? {} : { url: path.url }),
    }
  }
  const interfaceDescription = path.interfaceDescription === undefined ? undefined : { format: path.interfaceDescription.format, ...(path.interfaceDescription.url === undefined ? {} : { url: path.interfaceDescription.url }) }
  return {
    accessPathRef: path.accessPathRef,
    offeringRevision: path.offeringRevision,
    kind: 'external_operation',
    name: path.name,
    summary: path.summary,
    url: path.url,
    ...(path.method === undefined ? {} : { method: path.method }),
    ...(path.documentationUrl === undefined ? {} : { documentationUrl: path.documentationUrl }),
    ...(interfaceDescription === undefined ? {} : { interfaceDescription }),
    ...(path.authenticationSummary === undefined ? {} : { authenticationSummary: path.authenticationSummary }),
    ...(path.pricingSummary === undefined ? {} : { pricingSummary: path.pricingSummary }),
    provenance: path.provenance,
  }
}

function toConvexOffering(offering: OfferingSupplyDto['offerings'][number]): ConvexOfferingDto {
  const price = offering.price === undefined ? undefined : { ...offering.price }
  return { offeringRef: offering.offeringRef, revision: offering.revision, name: offering.name, category: offering.category, summary: offering.summary, ...(offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: offering.serviceAreaSummary }), ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: offering.availabilitySummary }), ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }), ...(price === undefined ? {} : { price }), accessPaths: offering.accessPaths.map(toConvexOfferingAccessPath), support: { integrated: offering.support.integrated, aeSupportedAction: offering.support.aeSupportedAction, ...(offering.support.observedAt === undefined ? {} : { observedAt: offering.support.observedAt }), ...(offering.support.validUntil === undefined ? {} : { validUntil: offering.support.validUntil }) } }
}

function toConvexOfferingBusiness(item: OfferingSupplyDto): ConvexOfferingBusinessDto {
  return {
    schemaVersion: item.schemaVersion,
    businessId: item.businessId,
    slug: item.slug,
    name: item.name,
    category: item.category,
    businessContext: item.businessContext,
    publicUrl: item.publicUrl,
    trustTier: item.trustTier,
    ...(item.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: item.responseTimeMinutes }),
    photos: item.photos.map((photo) => ({ url: photo.url, alt: photo.alt })),
    observedAt: item.observedAt,
    disposition: item.disposition,
    offerings: item.offerings.map(toConvexOffering),
    accessSummary: {
      humanRequest: item.accessSummary.humanRequest,
      externalOperation: item.accessSummary.externalOperation,
      aeSupportedAction: item.accessSummary.aeSupportedAction,
    },
  }
}

function offeringPriceCeiling(price: OfferingSupplyDto['offerings'][number]['price']): ExactAmount | undefined {
  if (price === undefined || price.kind === 'quote_only') return undefined
  return price.kind === 'range' ? price.maximum : price.amount
}

function filterOfferingSupplyByPrice(items: readonly OfferingSupplyDto[], args: { maxPrice?: ExactAmount; hasPrice?: boolean }): readonly OfferingSupplyDto[] {
  if (args.maxPrice === undefined && args.hasPrice !== true) return items
  return items.filter((item) => {
    if (args.hasPrice === true && !item.offerings.some((offering) => offering.price !== undefined)) return false
    const maxPrice = args.maxPrice
    if (maxPrice === undefined) return true
    let hasUnpricedOffering = false
    for (const offering of item.offerings) {
      const ceiling = offeringPriceCeiling(offering.price)
      if (ceiling === undefined) {
        hasUnpricedOffering = true
        continue
      }
      if (ceiling.currency !== maxPrice.currency) continue
      const comparison = compareExactAmounts(ceiling, maxPrice)
      if (comparison !== undefined && comparison <= 0) return true
    }
    return hasUnpricedOffering
  })
}
function paginateOfferingSupply(items: readonly OfferingSupplyDto[], input: QueryInput, query?: string) {
  const limit = normalizeLimit(input.limit)
  const startIndex = input.cursor === undefined
    ? 0
    : (() => {
        const index = items.findIndex((item) => item.slug === input.cursor)
        if (index < 0) throw new Error('registry_invalid_cursor')
        return index + 1
      })()
  const pageItems = items.slice(startIndex, startIndex + limit).map(toConvexOfferingBusiness)
  const next = items.at(startIndex + pageItems.length)
  return { kind: 'ok' as const, schemaVersion: 'public-business-catalog-api:v2' as const, ...(query === undefined ? {} : { query }), items: pageItems, pagination: { ...(input.cursor === undefined ? {} : { cursor: input.cursor }), ...(next === undefined ? {} : { nextCursor: next.slug }), limit, total: items.length, hasMore: next !== undefined } }
}

function matchesOfferingSupply(item: OfferingSupplyDto, tokens: readonly string[], locationKey: string | undefined): boolean {
  if (tokens.length === 0) return false
  if (locationKey !== undefined && !offeringPlaceKeys(item).includes(locationKey)) return false
  const contextTerms = item.businessContext.kind === 'local_human'
    ? [item.businessContext.suburb, item.businessContext.stateTerritory, item.businessContext.postcode ?? '']
    : [item.businessContext.website, item.businessContext.providerIdentifier]
  const haystack = normalizeSearchText([
    item.slug,
    item.name,
    item.category,
    ...contextTerms,
    ...item.offerings.flatMap((offering) => [offering.name, offering.category, offering.summary, offering.serviceAreaSummary ?? '']),
  ].join(' '))
  return matchesQueryTokens(haystack, tokens)
}


function matchesSearchDocument(document: Doc<'registrySearchDocuments'>, tokens: readonly string[], locationKey: string | undefined): boolean {
  if (tokens.length === 0) return false
  if (locationKey !== undefined && !document.placeKeys.includes(locationKey)) return false
  return matchesQueryTokens(document.searchText, tokens)
}

function uniqueBusinessSlugs(documents: readonly Doc<'registrySearchDocuments'>[]): string[] {
  const slugs = new Set<string>()
  for (const document of documents) if (document.businessSlug.length > 0) slugs.add(document.businessSlug)
  return [...slugs]
}

function offeringPlaceKeys(item: OfferingSupplyDto): readonly string[] {
  if (item.businessContext.kind !== 'local_human') return []
  const keys = new Set<string>()
  addPlaceKey(keys, item.businessContext.suburb)
  addPlaceKey(keys, `${item.businessContext.suburb} ${item.businessContext.stateTerritory}`)
  addPlaceKey(keys, item.businessContext.stateTerritory)
  if (item.businessContext.postcode !== undefined) addPlaceKey(keys, item.businessContext.postcode)
  for (const offering of item.offerings) for (const candidate of extractPlaceCandidates(offering.serviceAreaSummary ?? '')) addPlaceKey(keys, candidate)
  return [...keys]
}

const SEARCH_STOP_WORDS = new Set(['a', 'an', 'and', 'around', 'at', 'business', 'businesses', 'find', 'for', 'in', 'near', 'need', 'now', 'open', 'provider', 'providers', 'service', 'services', 'the', 'to'])
const SERVICE_WORDS = new Set([...SEARCH_STOP_WORDS, 'appointment', 'callout', 'cleaner', 'cleaners', 'day', 'dental', 'dentist', 'dentists', 'diagnostic', 'diagnostics', 'electrical', 'electrician', 'electricians', 'emergency', 'help', 'listed', 'listing', 'listings', 'locksmith', 'locksmiths', 'mechanic', 'mechanics', 'metro', 'offering', 'offerings', 'plumber', 'plumbers', 'plumbing', 'repair', 'repairs', 'same', 'suburb', 'suburbs', 'today', 'tomorrow', 'urgent', 'this', 'week', 'weeks'])
const STATE_WORDS = new Set(['act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa'])
const LOCATION_PREPOSITION = /\b(?:in|near|around|at)\s+([a-z][a-z\s'-]{1,80})(?:\?|$)/i

function matchesQueryTokens(haystack: string, tokens: readonly string[]): boolean { return tokens.every((token) => haystack.includes(token)) }
function resolveSearchLocationKey(input: { query: string; mode?: string; location?: string }): string | undefined { if (input.mode === 'whole_catalogue') return undefined; const explicit = normalizeLocationLabel(input.location); if (explicit !== undefined) return normalizeSearchText(explicit); const fromQuery = extractLocationFromQuery(input.query); return fromQuery === undefined ? undefined : normalizeSearchText(fromQuery) }
function extractLocationFromQuery(query: string): string | undefined {
  const prepositionMatch = normalizeSearchText(query).match(LOCATION_PREPOSITION)
  if (prepositionMatch?.[1] !== undefined) return normalizeLocationLabel(prepositionMatch[1])
  const normalized = normalizeLocationLabel(query)
  if (normalized === undefined) return undefined
  const tokens = dropTrailingState(normalized.split(/\s+/).filter(Boolean))
  const locationTokens = trimServiceWords(tokens)
  return locationTokens.length === tokens.length
    ? undefined
    : normalizeLocationLabel(locationTokens.join(' '))
}
function extractPlaceCandidates(value: string): readonly string[] { const normalized = normalizeSearchText(value); if (normalized.length === 0) return []; return normalized.replace(/\band nearby suburbs\b/g, '|').replace(/\bnearby suburbs\b/g, '|').replace(/\bmetro\b/g, ' metro|').split(/[|,;/]+/g).map((candidate) => trimServiceWords(candidate.split(/\s+/).filter(Boolean)).join(' ')).map((candidate) => candidate.replace(/\bmetro\b/g, '').trim()).filter((candidate) => candidate.length >= 3) }
function normalizeLocationLabel(value: string | undefined): string | undefined { if (value === undefined) return undefined; const words = value.trim().replace(/[^a-z0-9\s'-]+/gi, ' ').replace(/\s+/g, ' ').split(/\s+/).filter(Boolean).filter((word) => !STATE_WORDS.has(word.toLowerCase())); while (words.length > 0) { const first = words[0]; if (first === undefined || !SERVICE_WORDS.has(first.toLowerCase())) break; words.shift() } while (words.length > 0) { const last = words.at(-1); if (last === undefined || !SERVICE_WORDS.has(last.toLowerCase())) break; words.pop() } const label = words.join(' ').trim(); if (label.length < 3 || /\d/.test(label)) return undefined; return label }
function dropTrailingState(tokens: readonly string[]): readonly string[] { const last = tokens.at(-1)?.toLowerCase(); return last !== undefined && STATE_WORDS.has(last) ? tokens.slice(0, -1) : tokens }
function trimServiceWords(tokens: readonly string[]): readonly string[] { let start = 0; let end = tokens.length; while (start < end) { const token = tokens[start]; if (token === undefined || !SERVICE_WORDS.has(token.toLowerCase())) break; start += 1 } while (end > start) { const token = tokens[end - 1]; if (token === undefined || !SERVICE_WORDS.has(token.toLowerCase())) break; end -= 1 } return tokens.slice(start, end) }
function addPlaceKey(keys: Set<string>, value: string): void { const key = normalizeSearchText(value); if (key.length > 0) keys.add(key) }
function normalizeLimit(limit: number | undefined): number { if (limit === undefined || !Number.isFinite(limit)) return 20; return Math.min(Math.max(Math.trunc(limit), 1), 50) }

export type { IndexStatus, RegistryProjectionAttemptContract } from '../src/modules/registry/public'
