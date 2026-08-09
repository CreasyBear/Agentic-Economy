import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import {
  DEFAULT_LOCAL_REGISTRY_FIXTURE_SLUG,
  LOCAL_E2E_BUSINESS_FIXTURES,
} from '@/lib/dev/local-e2e-business-fixtures'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'
import type { ActionTimingSink } from '@/modules/common/action'
import { recordSearchGaps } from '@/modules/demand/demand.functions'
import { toSearchGapCandidateV2, type SearchGapSurface } from '@/modules/demand/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { normalizeSearchText } from '@/modules/common/normalize-search-text'
import {
  buildRegistrySearchDocumentsFromCatalogs,
  documentMatchesRegistryQuery,
} from './internal/search-documents'
import type {
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  PublicBusinessCatalogV2DetailResult,
  PublishedInquiryTargetResolution,
} from '@/modules/registry/public'

export type PublicRegistrySourcePort = {
  list: (input: PublicBusinessCatalogQueryInput) => Promise<PublicBusinessCatalogApiV2Page>
  search: (input: PublicBusinessCatalogSearchInput) => Promise<PublicBusinessCatalogApiV2SearchPage>
  detail: (input: { slug: string }) => Promise<PublicBusinessCatalogV2DetailResult>
  resolveInquiryTarget: (input: {
    businessSlug: string
    offeringRef: string
  }) => Promise<PublishedInquiryTargetResolution>
}

export type PublicRegistryReadOptions = {
  timing?: ActionTimingSink
  surface?: SearchGapSurface
}

const listPublicBusinessOfferingSupplyQuery = sourceQuery<PublicBusinessCatalogQueryInput, PublicBusinessCatalogApiV2Page>(
  'registry:listPublicBusinessOfferingSupply'
)
const searchPublicBusinessOfferingSupplyQuery = sourceQuery<PublicBusinessCatalogSearchInput, PublicBusinessCatalogApiV2SearchPage>(
  'registry:searchPublicBusinessOfferingSupply'
)
const getPublicBusinessOfferingSupplyBySlugQuery = sourceQuery<{ slug: string }, PublicBusinessCatalogV2DetailResult>(
  'registry:getPublicBusinessOfferingSupplyBySlug'
)
const resolvePublishedInquiryTargetQuery = sourceQuery<
  { businessSlug: string; offeringRef: string },
  PublishedInquiryTargetResolution
>('registry:resolvePublishedInquiryTargetBySlug')

let publicRegistrySourcePortForTests: PublicRegistrySourcePort | undefined

export function setPublicRegistrySourcePortForTests(port: PublicRegistrySourcePort | undefined): () => void {
  const previous = publicRegistrySourcePortForTests
  publicRegistrySourcePortForTests = port
  return () => {
    publicRegistrySourcePortForTests = previous
  }
}


export async function readPublicOfferingRegistryPage(
  input: PublicBusinessCatalogQueryInput,
): Promise<PublicBusinessCatalogApiV2Page> {
  if (publicRegistrySourcePortForTests !== undefined || useLocalRegistryFixture()) {
    return getPublicRegistrySourcePort().list(input)
  }
  return callPublicSourceQuery(listPublicBusinessOfferingSupplyQuery, input)
}

export async function readPublicOfferingRegistrySearchPage(
  input: PublicBusinessCatalogSearchInput,
  options: PublicRegistryReadOptions = {},
): Promise<PublicBusinessCatalogApiV2SearchPage> {
  const page = await readOfferingSearchPageUninstrumented(input, options)
  if (options.surface !== undefined && input.cursor === undefined) {
    await recordSearchGaps({
      queryText: input.query,
      surface: options.surface,
      candidates: page.items.map(toSearchGapCandidateV2),
    })
  }
  return page
}

async function readOfferingSearchPageUninstrumented(
  input: PublicBusinessCatalogSearchInput,
  options: PublicRegistryReadOptions,
): Promise<PublicBusinessCatalogApiV2SearchPage> {
  return withTiming(options.timing, 'registry.search.convex', { backend: 'convex' }, () =>
    readOfferingSearchPageFromSource(input))
}

function readOfferingSearchPageFromSource(
  input: PublicBusinessCatalogSearchInput,
): Promise<PublicBusinessCatalogApiV2SearchPage> {
  if (publicRegistrySourcePortForTests !== undefined || useLocalRegistryFixture()) {
    return getPublicRegistrySourcePort().search(input)
  }
  return callPublicSourceQuery(searchPublicBusinessOfferingSupplyQuery, input)
}


export async function readPublicOfferingRegistryBusinessDetail(
  input: { slug: string },
): Promise<PublicBusinessCatalogV2DetailResult> {
  if (publicRegistrySourcePortForTests !== undefined || useLocalRegistryFixture()) {
    return getPublicRegistrySourcePort().detail(input)
  }
  return callPublicSourceQuery(getPublicBusinessOfferingSupplyBySlugQuery, input)
}

export async function resolvePublicRegistryInquiryTarget(input: {
  businessSlug: string
  offeringRef: string
}): Promise<PublishedInquiryTargetResolution> {
  return getPublicRegistrySourcePort().resolveInquiryTarget(input)
}

function getPublicRegistrySourcePort(): PublicRegistrySourcePort {
  if (publicRegistrySourcePortForTests !== undefined) {
    return publicRegistrySourcePortForTests
  }
  if (useLocalRegistryFixture()) {
    return createLocalRegistrySourcePort()
  }
  return {
    list: (input) => callPublicSourceQuery(listPublicBusinessOfferingSupplyQuery, input),
    search: (input) => callPublicSourceQuery(searchPublicBusinessOfferingSupplyQuery, input),
    detail: (input) => callPublicSourceQuery(getPublicBusinessOfferingSupplyBySlugQuery, input),
    resolveInquiryTarget: (input) => callPublicSourceQuery(resolvePublishedInquiryTargetQuery, input),
  }
}

type NativeFixtureAccessPath = Readonly<{
  kind: 'human_request'
  channel: 'phone' | 'website' | 'ae_inquiry'
  disclosure: string
}>

type NativeFixtureOffering = Readonly<{
  name: string
  category: string
  summary: string
  serviceAreaSummary: string
  availabilitySummary?: string
  pricingSummary?: string
  accessPaths: readonly NativeFixtureAccessPath[]
}>

type NativeFixtureInput = Readonly<{
  requestedSlug: string
  businessName: string
  category: string
  suburb: string
  stateTerritory: string
  publishedPhone?: string
  offerings: readonly NativeFixtureOffering[]
  responseTimeMinutes?: number
}>

const DEFAULT_NATIVE_FIXTURE: NativeFixtureInput = {
  requestedSlug: DEFAULT_LOCAL_REGISTRY_FIXTURE_SLUG,
  businessName: 'Parramatta Emergency Plumbing',
  category: 'Emergency plumbing',
  suburb: 'Parramatta',
  stateTerritory: 'NSW',
  offerings: [{
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Burst pipe triage and repair for urgent local plumbing jobs.',
    serviceAreaSummary: 'Parramatta and nearby suburbs',
    accessPaths: [],
  }],
}

function createLocalRegistrySourcePort(): PublicRegistrySourcePort {
  const items = createLocalNativeOfferingFixtures()
  return {
    list: (input) => Promise.resolve(nativeOfferingListPage(items, input)),
    search: (input) => Promise.resolve(searchNativeOfferings(items, input)),
    detail: (input) => Promise.resolve(nativeOfferingDetail(items, input.slug)),
    resolveInquiryTarget: (input) => Promise.resolve(resolveNativeInquiryTarget(items, input)),
  }
}

function createLocalNativeOfferingFixtures(): PublicBusinessCatalogApiV2Dto[] {
  const seed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
  const fixtures: readonly NativeFixtureInput[] = seed === 'broad'
    ? DEV_SEED_BUSINESS_FIXTURES.map(nativeFixtureFromDevSeed)
    : [DEFAULT_NATIVE_FIXTURE, ...LOCAL_E2E_BUSINESS_FIXTURES.map(nativeFixtureFromLocal)]
  const observedAt = 1_735_689_600_000
  return fixtures.map((fixture, index) => nativeOfferingForFixture(fixture, observedAt + index * 1_000))
}

function nativeFixtureFromLocal(
  fixture: (typeof LOCAL_E2E_BUSINESS_FIXTURES)[number],
): NativeFixtureInput {
  const offerings = fixture.offerings.map((offering) => ({
    name: offering.name,
    category: offering.category,
    summary: offering.summary,
    serviceAreaSummary: offering.serviceAreaSummary,
    ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: offering.availabilitySummary }),
    ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }),
    accessPaths: offering.accessPaths.map((path) => ({
      kind: path.kind,
      channel: path.channel,
      disclosure: path.disclosure,
    })),
  }))
  if (offerings.length === 0) {
    throw new Error(`local_registry_fixture_offering_missing:${fixture.requestedSlug}`)
  }
  return {
    requestedSlug: fixture.requestedSlug,
    businessName: fixture.businessName,
    category: fixture.category,
    suburb: fixture.suburb,
    stateTerritory: fixture.stateTerritory,
    ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
    offerings,
    ...(fixture.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: fixture.responseTimeMinutes }),
  }
}

function nativeFixtureFromDevSeed(
  fixture: (typeof DEV_SEED_BUSINESS_FIXTURES)[number],
): NativeFixtureInput {
  const offerings = fixture.offerings.map((offering) => {
    const explicitAccessPaths = offering.accessPaths.map((path) => ({
      kind: path.kind,
      channel: path.channel,
      disclosure: path.disclosure,
    }))
    return {
      name: offering.name,
      category: offering.category,
      summary: offering.summary,
      serviceAreaSummary: offering.serviceAreaSummary,
      ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: offering.availabilitySummary }),
      ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }),
      accessPaths: explicitAccessPaths,
    }
  })
  if (offerings.length === 0) {
    throw new Error(`dev_seed_fixture_offering_missing:${fixture.requestedSlug}`)
  }
  return {
    requestedSlug: fixture.requestedSlug,
    businessName: fixture.businessName,
    category: fixture.category,
    suburb: fixture.suburb,
    stateTerritory: fixture.stateTerritory,
    ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
    offerings,
    ...(fixture.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: fixture.responseTimeMinutes }),
  }
}

function nativeOfferingForFixture(
  fixture: NativeFixtureInput,
  observedAt: number,
): PublicBusinessCatalogApiV2Dto {
  const offerings = fixture.offerings.map((offering) => {
    const offeringSlug = normalizeSearchText(offering.name).replaceAll(' ', '-')
    const offeringRef = `offering:${fixture.requestedSlug}:${offeringSlug}`
    const accessPaths = offering.accessPaths.map((path, index) => ({
      accessPathRef: `${offeringRef}:${path.channel}:${index + 1}`,
      offeringRevision: 1,
      kind: path.kind,
      channel: path.channel,
      disclosure: path.disclosure,
    }))
    const availabilitySummary = publicAvailability(offering.availabilitySummary)
    return {
      offeringRef,
      revision: 1,
      name: offering.name,
      category: offering.category,
      summary: offering.summary,
      serviceAreaSummary: offering.serviceAreaSummary,
      ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
      ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }),
      accessPaths,
      support: { integrated: false, aeSupportedAction: false, observedAt },
    }
  })
  if (offerings.length === 0) {
    throw new Error(`native_registry_fixture_offering_missing:${fixture.requestedSlug}`)
  }
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: `business:${fixture.requestedSlug}`,
    slug: fixture.requestedSlug,
    name: fixture.businessName,
    category: fixture.category,
    suburb: fixture.suburb,
    stateTerritory: fixture.stateTerritory,
    ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
    publicUrl: `/${fixture.requestedSlug}`,
    trustTier: 'claimed',
    ...(fixture.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: fixture.responseTimeMinutes }),
    photos: [],
    observedAt,
    disposition: 'current',
    offerings,
    accessSummary: {
      humanRequest: offerings.some((offering) => offering.accessPaths.length > 0),
      externalOperation: false,
      aeSupportedAction: false,
    },
  }
}

function publicAvailability(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized === '' || normalized === 'unknown' || normalized === 'hours unknown' || normalized === 'hours supplied by owner'
    ? undefined
    : value
}

function normalizePublicLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20
  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}

function nativeOfferingListPage(
  items: readonly PublicBusinessCatalogApiV2Dto[],
  input: PublicBusinessCatalogQueryInput,
): PublicBusinessCatalogApiV2Page {
  const requestedStart = input.paginationOpts.cursor === null
    ? 0
    : Number(input.paginationOpts.cursor)
  if (!Number.isSafeInteger(requestedStart) || requestedStart < 0) {
    throw new Error('registry_invalid_cursor')
  }
  const page = items.slice(requestedStart, requestedStart + input.paginationOpts.numItems)
  const next = requestedStart + page.length
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    page,
    isDone: next >= items.length,
    continueCursor: String(next),
  }
}

function searchNativeOfferings(
  items: readonly PublicBusinessCatalogApiV2Dto[],
  input: PublicBusinessCatalogSearchInput,
): PublicBusinessCatalogApiV2SearchPage {
  const query = normalizeSearchText(input.query)
  const matchedSlugs = new Set<string>()
  for (const document of buildRegistrySearchDocumentsFromCatalogs(items)) {
    if (documentMatchesRegistryQuery(document, input)) {
      matchedSlugs.add(document.businessSlug)
    }
  }
  const ranked = items
    .filter((item) => matchedSlugs.has(item.slug))
    .slice()
    .sort((left, right) => left.slug.localeCompare(right.slug))
  const limit = normalizePublicLimit(input.limit)
  const start = input.cursor === undefined
    ? 0
    : (() => {
        const index = ranked.findIndex((item) => item.slug === input.cursor)
        if (index < 0) throw new Error('registry_invalid_cursor')
        return index + 1
      })()
  const page = ranked.slice(start, start + limit)
  const next = ranked[start + page.length]
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    query,
    items: page,
    pagination: {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(next === undefined ? {} : { nextCursor: next.slug }),
      limit,
      total: ranked.length,
      hasMore: next !== undefined,
    },
  }
}


function nativeOfferingDetail(
  items: readonly PublicBusinessCatalogApiV2Dto[],
  slug: string,
): PublicBusinessCatalogV2DetailResult {
  const business = items.find((item) => item.slug === slug)
  return business === undefined
    ? { kind: 'not_found', code: 'business_not_found', reason: 'No public business catalog exists for this slug.' }
    : { kind: 'found', schemaVersion: 'public-business-catalog-api:v2', business }
}

function resolveNativeInquiryTarget(
  items: readonly PublicBusinessCatalogApiV2Dto[],
  input: { businessSlug: string; offeringRef: string },
): PublishedInquiryTargetResolution {
  const business = items.find((item) => item.slug === input.businessSlug)
  const offering = business?.offerings.find((item) => item.offeringRef === input.offeringRef)
  return business === undefined || offering === undefined
    ? { kind: 'not_found', reason: 'No published Offering is discoverable for this slug and reference.' }
    : {
        kind: 'resolved',
        businessId: brandNonEmpty(business.businessId, 'BusinessId'),
        offeringRef: brandNonEmpty(offering.offeringRef, 'OfferingRef'),
      }
}


function useLocalRegistryFixture(): boolean {
  const convexUrl = process.env.CONVEX_URL?.trim() || process.env.VITE_CONVEX_URL?.trim()
  return isLocalE2EAuthBypassEnabled() && convexUrl === undefined
}

async function withTiming<T>(
  timing: ActionTimingSink | undefined,
  name: string,
  metadata: Record<string, string | number | boolean | null>,
  run: () => Promise<T>,
): Promise<T> {
  if (timing === undefined) {
    return run()
  }

  const started = Date.now()
  try {
    return await run()
  } finally {
    timing.record(name, Date.now() - started, metadata)
  }
}
