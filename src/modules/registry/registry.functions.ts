import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { buildDevSeedCatalogState } from '@/modules/dev/public'
import type { ActionTimingSink } from '@/modules/common/action'
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

export async function readPublicRegistryCatalogPage(
  input: PublicBusinessCatalogQueryInput
): Promise<PublicBusinessCatalogApiPage> {
  return filterPublicRegistryPage(getPublicRegistrySourcePort().list(input))
}

export async function readPublicRegistrySearchPage(
  input: PublicBusinessCatalogSearchInput,
  options: PublicRegistryReadOptions = {},
): Promise<PublicBusinessCatalogApiPage> {
  const sourcePort = getPublicRegistrySourcePort()
  const backend = catalogSearchBackendForTests ?? readCatalogSearchBackend()
  const timing = options.timing

  if (backend === 'convex') {
    return withTiming(timing, 'registry.search.convex', { backend }, () =>
      filterPublicRegistryPage(sourcePort.search(input)),
    )
  }

  const searchPort = catalogSearchPortForTests ?? createConfiguredMeiliCatalogSearchPort()
  if (searchPort === undefined) {
    return withTiming(timing, 'registry.search.convex_fallback', { backend }, () =>
      filterPublicRegistryPage(sourcePort.search(input)),
    )
  }

  if (backend === 'dual') {
    void withTiming(timing, 'registry.search.meili_shadow', { backend }, () =>
      searchPort.search(input),
    ).catch(() => undefined)
    return withTiming(timing, 'registry.search.convex', { backend }, () =>
      filterPublicRegistryPage(sourcePort.search(input)),
    )
  }

  try {
    const result = await withTiming(timing, 'registry.search.meili', { backend }, () =>
      searchPort.search(input),
    )
    if (result.processingTimeMs !== undefined) {
      timing?.record('registry.search.meili_processing', result.processingTimeMs, {
        backend,
      })
    }
    return withTiming(timing, 'registry.search.hydration', {
      backend,
      hits: result.hits.length,
    }, () =>
      filterPublicRegistryPage(hydrateCatalogSearchResult(input, result, sourcePort)),
    )
  } catch {
    return withTiming(timing, 'registry.search.convex_fallback', { backend }, () =>
      filterPublicRegistryPage(sourcePort.search(input)),
    )
  }
}

export async function readPublicRegistryBusinessDetail(input: {
  slug: string
}): Promise<PublicBusinessCatalogDetailResult> {
  return filterPublicRegistryDetail(getPublicRegistrySourcePort().detail(input))
}

export async function readPublicOfferingRegistryPage(
  input: PublicBusinessCatalogQueryInput,
): Promise<PublicBusinessCatalogApiV2Page> {
  if (isLocalE2EAuthBypassEnabled()) {
    return adaptLegacyPage(await createLegacyRegistrySourcePort().list(input))
  }
  return queryRegistryWithLegacyFallback(
    () => callPublicSourceQuery(listPublicBusinessOfferingSupplyQuery, input),
    () => adaptLegacyPage(legacyPublicRegistryList(input)),
  )
}

export async function readPublicOfferingRegistrySearchPage(
  input: PublicBusinessCatalogSearchInput,
): Promise<PublicBusinessCatalogApiV2Page> {
  if (isLocalE2EAuthBypassEnabled()) {
    return adaptLegacyPage(await createLegacyRegistrySourcePort().search(input))
  }
  return queryRegistryWithLegacyFallback(
    () => callPublicSourceQuery(searchPublicBusinessOfferingSupplyQuery, input),
    () => adaptLegacyPage(legacyPublicRegistrySearch(input)),
  )
}

export async function readPublicOfferingRegistryBusinessDetail(
  input: { slug: string },
): Promise<PublicBusinessCatalogV2DetailResult> {
  if (isLocalE2EAuthBypassEnabled()) {
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

export function legacyPublicRegistryList(
  input: PublicBusinessCatalogQueryInput = {}
): PublicBusinessCatalogApiPage {
  return listPublicBusinessCatalog(createDefaultRegistrySourceState(), input)
}

export function legacyPublicRegistrySearch(input: PublicBusinessCatalogSearchInput): PublicBusinessCatalogApiPage {
  return searchPublicBusinessCatalog(createDefaultRegistrySourceState(), input)
}

export function legacyPublicRegistryDetail(input: { slug: string }): PublicBusinessCatalogDetailResult {
  return getPublicBusinessCatalogBySlug(createDefaultRegistrySourceState(), input)
}

function getPublicRegistrySourcePort(): PublicRegistrySourcePort {

  if (isLocalE2EAuthBypassEnabled()) {
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

async function hydrateCatalogSearchResult(
  input: PublicBusinessCatalogSearchInput,
  result: CatalogSearchResult,
  sourcePort: PublicRegistrySourcePort,
): Promise<PublicBusinessCatalogApiPage> {
  const seenSlugs = new Set<string>()
  const uniqueSlugs: string[] = []

  for (const hit of result.hits) {
    if (seenSlugs.has(hit.businessSlug)) {
      continue
    }
    seenSlugs.add(hit.businessSlug)
    uniqueSlugs.push(hit.businessSlug)
  }

  const hydrated: PublicBusinessCatalogApiDto[] = []
  const details = await Promise.all(uniqueSlugs.map((slug) => sourcePort.detail({ slug })))
  for (const detail of details) {
    if (detail.kind === 'found') {
      hydrated.push(detail.business)
    }
  }

  return paginateHydratedSearchResults(input, hydrated, result)
}

function paginateHydratedSearchResults(
  input: PublicBusinessCatalogSearchInput,
  items: PublicBusinessCatalogApiPage['items'],
  result: CatalogSearchResult,
): PublicBusinessCatalogApiPage {
  const limit = normalizePublicLimit(input.limit)
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
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v1',
    query: normalizeRegistrySearchText(input.query),
    items: pageItems,
    pagination: {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(next === undefined ? {} : { nextCursor: next.slug }),
      limit,
      total: Math.max(items.length, result.estimatedTotalHits ?? items.length),
      hasMore: next !== undefined,
    },
  }
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
    if (isLocalE2EAuthBypassEnabled()) {
      return fallback()
    }
    throw new Error('registry_source_query_failed', { cause: error })
  }
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
