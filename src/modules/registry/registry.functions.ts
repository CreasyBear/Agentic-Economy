import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { buildDevSeedCatalogState } from '@/modules/dev/public'
import type { ActionTimingSink } from '@/modules/common/action'
import { recordSearchGaps } from '@/modules/demand/demand.functions'
import type { SearchGapSurface } from '@/modules/demand/public'
import { toSearchGapCandidateV2 } from '@/modules/demand/public'
import {
  createDefaultRegistrySourceState,
  createLocalE2eRegistrySourceState,
  adaptLegacyCatalogToOfferingApi,
  getPublicBusinessCatalogBySlug,
  listPublicBusinessCatalog,
  resolvePublishedInquiryTarget,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogV2DetailResult,
  PublishedInquiryTargetResolution,
} from '@/modules/registry/public'
import {
  createConfiguredMeiliCatalogSearchPort,
  readCatalogSearchBackend,
  type CatalogSearchBackend,
  type CatalogSearchPort,
  type CatalogSearchResult,
} from './internal/catalog-search-port'
import { normalizeRegistrySearchText } from './internal/search-documents'

export type PublicRegistrySourcePort = {
  list: (input: PublicBusinessCatalogQueryInput) => Promise<PublicBusinessCatalogApiPage>
  search: (input: PublicBusinessCatalogSearchInput) => Promise<PublicBusinessCatalogApiPage>
  detail: (input: { slug: string }) => Promise<PublicBusinessCatalogDetailResult>
  resolveInquiryTarget: (input: {
    businessSlug: string
    serviceSlug: string
  }) => Promise<PublishedInquiryTargetResolution>
}

export type PublicRegistryReadOptions = {
  timing?: ActionTimingSink
  surface?: SearchGapSurface
}

const listPublicBusinessCatalogQuery = sourceQuery<PublicBusinessCatalogQueryInput, PublicBusinessCatalogApiPage>(
  'registry:listPublicBusinessCatalog'
)
const searchPublicBusinessCatalogQuery = sourceQuery<PublicBusinessCatalogSearchInput, PublicBusinessCatalogApiPage>(
  'registry:searchPublicBusinessCatalog'
)
const getPublicBusinessCatalogBySlugQuery = sourceQuery<{ slug: string }, PublicBusinessCatalogDetailResult>(
  'registry:getPublicBusinessCatalogBySlug'
)
const listPublicBusinessOfferingSupplyQuery = sourceQuery<PublicBusinessCatalogQueryInput, PublicBusinessCatalogApiV2Page>(
  'registry:listPublicBusinessOfferingSupply'
)
const searchPublicBusinessOfferingSupplyQuery = sourceQuery<PublicBusinessCatalogSearchInput, PublicBusinessCatalogApiV2Page>(
  'registry:searchPublicBusinessOfferingSupply'
)
const getPublicBusinessOfferingSupplyBySlugQuery = sourceQuery<{ slug: string }, PublicBusinessCatalogV2DetailResult>(
  'registry:getPublicBusinessOfferingSupplyBySlug'
)
const resolvePublishedInquiryTargetQuery = sourceQuery<
  { businessSlug: string; serviceSlug: string },
  PublishedInquiryTargetResolution
>('registry:resolvePublishedInquiryTargetBySlug')

let catalogSearchPortForTests: CatalogSearchPort | undefined
let catalogSearchBackendForTests: CatalogSearchBackend | undefined

export function setCatalogSearchPortForTests(port: CatalogSearchPort | undefined): () => void {
  const previous = catalogSearchPortForTests
  catalogSearchPortForTests = port
  return () => {
    catalogSearchPortForTests = previous
  }
}

export function setCatalogSearchBackendForTests(backend: CatalogSearchBackend | undefined): () => void {
  const previous = catalogSearchBackendForTests
  catalogSearchBackendForTests = backend
  return () => {
    catalogSearchBackendForTests = previous
  }
}

export async function readPublicOfferingRegistryPage(
  input: PublicBusinessCatalogQueryInput,
): Promise<PublicBusinessCatalogApiV2Page> {
  if (useLocalRegistryFixture()) {
    return adaptLegacyPage(await createLegacyRegistrySourcePort().list(input))
  }
  return queryRegistryWithLegacyFallback(
    () => callPublicSourceQuery(listPublicBusinessOfferingSupplyQuery, input),
    () => adaptLegacyPage(legacyPublicRegistryList(input)),
  )
}

export async function readPublicOfferingRegistrySearchPage(
  input: PublicBusinessCatalogSearchInput,
  options: PublicRegistryReadOptions = {},
): Promise<PublicBusinessCatalogApiV2Page> {
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

/**
 * The external search backend is selected here, on the Offering projection.
 * It used to be reachable only from the legacy projection, which meant
 * choosing Meilisearch also meant choosing the weaker set of facts.
 */
async function readOfferingSearchPageUninstrumented(
  input: PublicBusinessCatalogSearchInput,
  options: PublicRegistryReadOptions,
): Promise<PublicBusinessCatalogApiV2Page> {
  const timing = options.timing
  const backend = catalogSearchBackendForTests ?? readCatalogSearchBackend()
  const searchPort = backend === 'convex'
    ? undefined
    : catalogSearchPortForTests ?? createConfiguredMeiliCatalogSearchPort()

  if (searchPort === undefined) {
    const label = backend === 'convex' ? 'registry.search.convex' : 'registry.search.convex_fallback'
    return withTiming(timing, label, { backend }, () => readOfferingSearchPageFromSource(input))
  }

  if (backend === 'dual') {
    void withTiming(timing, 'registry.search.meili_shadow', { backend }, () =>
      searchPort.search(input),
    ).catch(() => undefined)
    return withTiming(timing, 'registry.search.convex', { backend }, () =>
      readOfferingSearchPageFromSource(input))
  }

  let result: CatalogSearchResult | undefined
  try {
    result = await withTiming(timing, 'registry.search.meili', { backend }, () =>
      searchPort.search(input),
    )
  } catch {
    result = undefined
  }
  if (result?.processingTimeMs !== undefined) {
    timing?.record('registry.search.meili_processing', result.processingTimeMs, { backend })
  }

  // A stale, empty, or not-yet-indexed Meili index answers a real query with zero hits.
  // That is a miss in the index, not evidence that the registry holds nothing.
  if (
    result === undefined
    || (result.hits.length === 0 && normalizeRegistrySearchText(input.query).length > 0)
  ) {
    return withTiming(timing, 'registry.search.convex_fallback', { backend }, () =>
      readOfferingSearchPageFromSource(input))
  }

  const searchResult = result
  return withTiming(timing, 'registry.search.hydration', {
    backend,
    hits: searchResult.hits.length,
  }, () => hydrateOfferingSearchResult(input, searchResult))
}

function readOfferingSearchPageFromSource(
  input: PublicBusinessCatalogSearchInput,
): Promise<PublicBusinessCatalogApiV2Page> {
  if (useLocalRegistryFixture()) {
    return createLegacyRegistrySourcePort().search(input).then(adaptLegacyPage)
  }
  return queryRegistryWithLegacyFallback(
    () => callPublicSourceQuery(searchPublicBusinessOfferingSupplyQuery, input),
    () => adaptLegacyPage(legacyPublicRegistrySearch(input)),
  )
}

/** Meilisearch returns ranked slugs; the Offering projection supplies the facts. */
async function hydrateOfferingSearchResult(
  input: PublicBusinessCatalogSearchInput,
  result: CatalogSearchResult,
): Promise<PublicBusinessCatalogApiV2Page> {
  const uniqueSlugs = [...new Set(result.hits.map((hit) => hit.businessSlug))]
  const details = await Promise.all(
    uniqueSlugs.map((slug) => readPublicOfferingRegistryBusinessDetail({ slug })),
  )
  const items = details.flatMap((detail) => detail.kind === 'found' ? [detail.business] : [])
  const limit = normalizePublicLimit(input.limit)
  const startIndex = input.cursor === undefined
    ? 0
    : Math.max(items.findIndex((item) => item.slug === input.cursor), 0)
  const pageItems = items.slice(startIndex, startIndex + limit)
  const nextItem = items[startIndex + limit]

  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    query: input.query,
    items: pageItems,
    pagination: {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(nextItem === undefined ? {} : { nextCursor: nextItem.slug }),
      limit,
      total: result.estimatedTotalHits ?? items.length,
      hasMore: nextItem !== undefined,
    },
  }
}

export async function readPublicOfferingRegistryBusinessDetail(
  input: { slug: string },
): Promise<PublicBusinessCatalogV2DetailResult> {
  if (useLocalRegistryFixture()) {
    const legacy = await createLegacyRegistrySourcePort().detail(input)
    return legacy.kind === 'not_found'
      ? legacy
      : {
          kind: 'found',
          schemaVersion: 'public-business-catalog-api:v2',
          business: adaptLegacyCatalogToOfferingApi(legacy.business),
        }
  }
  return queryRegistryWithLegacyFallback(
    () => callPublicSourceQuery(getPublicBusinessOfferingSupplyBySlugQuery, input),
    () => {
      const legacy = legacyPublicRegistryDetail(input)
      return legacy.kind === 'not_found'
        ? legacy
        : {
            kind: 'found' as const,
            schemaVersion: 'public-business-catalog-api:v2' as const,
            business: adaptLegacyCatalogToOfferingApi(legacy.business),
          }
    },
  )
}

export async function resolvePublicRegistryInquiryTarget(input: {
  businessSlug: string
  serviceSlug: string
}): Promise<PublishedInquiryTargetResolution> {
  return getPublicRegistrySourcePort().resolveInquiryTarget(input)
}

function legacyPublicRegistryList(
  input: PublicBusinessCatalogQueryInput = {}
): PublicBusinessCatalogApiPage {
  return listPublicBusinessCatalog(createDefaultRegistrySourceState(), input)
}

function legacyPublicRegistrySearch(input: PublicBusinessCatalogSearchInput): PublicBusinessCatalogApiPage {
  return searchPublicBusinessCatalog(createDefaultRegistrySourceState(), input)
}

function legacyPublicRegistryDetail(input: { slug: string }): PublicBusinessCatalogDetailResult {
  return getPublicBusinessCatalogBySlug(createDefaultRegistrySourceState(), input)
}

function getPublicRegistrySourcePort(): PublicRegistrySourcePort {


  if (useLocalRegistryFixture()) {
    return createLegacyRegistrySourcePort()
  }
  return {
    list: (input) => queryRegistryWithLegacyFallback(() => callPublicSourceQuery(listPublicBusinessCatalogQuery, input), () => legacyPublicRegistryList(input)),
    search: (input) =>
      queryRegistryWithLegacyFallback(() => callPublicSourceQuery(searchPublicBusinessCatalogQuery, input), () =>
        legacyPublicRegistrySearch(input),
      ),
    detail: (input) =>
      queryRegistryWithLegacyFallback(() => callPublicSourceQuery(getPublicBusinessCatalogBySlugQuery, input), () =>
        legacyPublicRegistryDetail(input),
      ),
    resolveInquiryTarget: (input) =>
      queryRegistryWithLegacyFallback(
        () => callPublicSourceQuery(resolvePublishedInquiryTargetQuery, input),
        () => resolvePublishedInquiryTarget(createDefaultRegistrySourceState(), input),
      ),
  }
}

function createLegacyRegistrySourcePort(): PublicRegistrySourcePort {
  const state = createLocalRegistrySourceState()

  return {
    list: (input) => Promise.resolve(listPublicBusinessCatalog(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessCatalog(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessCatalogBySlug(state, input)),
    resolveInquiryTarget: (input) =>
      Promise.resolve(resolvePublishedInquiryTarget(state, input)),
  }
}

function createLocalRegistrySourceState() {
  const seed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
  if (seed === 'default') {
    return createDefaultRegistrySourceState()
  }
  if (seed === 'broad') {
    return buildDevSeedCatalogState().state
  }
  return createLocalE2eRegistrySourceState()
}

function normalizePublicLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}

function adaptLegacyPage(page: PublicBusinessCatalogApiPage): PublicBusinessCatalogApiV2Page {
  return {
    ...page,
    schemaVersion: 'public-business-catalog-api:v2',
    items: page.items.map(adaptLegacyCatalogToOfferingApi),
  }
}

export async function filterPublicRegistryPage(
  pagePromise: Promise<PublicBusinessCatalogApiPage>,
): Promise<PublicBusinessCatalogApiPage> {
  const page = await pagePromise
  const items = page.items.filter(isPublicRegistryDtoAllowed)
  const removed = page.items.length - items.length
  if (removed === 0) {
    return page
  }

  const total = Math.max(items.length, page.pagination.total - removed)
  return {
    ...page,
    items,
    pagination: {
      ...page.pagination,
      total,
      hasMore: page.pagination.hasMore || total > items.length,
    },
  }
}

export async function filterPublicRegistryDetail(
  detailPromise: Promise<PublicBusinessCatalogDetailResult>,
): Promise<PublicBusinessCatalogDetailResult> {
  const detail = await detailPromise
  if (detail.kind === 'not_found' || isPublicRegistryDtoAllowed(detail.business)) {
    return detail
  }

  return {
    kind: 'not_found',
    code: 'business_not_found',
    reason: 'No public business catalog exists for this slug.',
  }
}

function isPublicRegistryDtoAllowed(item: PublicBusinessCatalogApiDto): boolean {
  return !isAgenticEconomySmokeCatalog(item)
}

function isAgenticEconomySmokeCatalog(item: PublicBusinessCatalogApiDto): boolean {
  const identity = normalizeRegistrySearchText(`${item.slug} ${item.name}`)
  if (!identity.includes('agentic economy')) {
    return false
  }

  const searchableText = normalizeRegistrySearchText(
    [
      item.slug,
      item.name,
      item.category,
      ...item.services.flatMap((service) => [
        service.slug,
        service.name,
        service.category,
        service.summary,
        service.serviceArea,
      ]),
    ].join(' '),
  )

  return /\b(?:smoke|r10|readback)\b/.test(searchableText)
}

async function queryRegistryWithLegacyFallback<T>(query: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await query()
  } catch (error) {
    if (useLocalRegistryFixture()) {
      return fallback()
    }
    throw new Error('registry_source_query_failed', { cause: error })
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
