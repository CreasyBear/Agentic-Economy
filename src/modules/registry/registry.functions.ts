import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import type { ActionTimingSink } from '@/modules/common/action'
import {
  createDefaultRegistrySourceState,
  getPublicBusinessCatalogBySlug,
  listPublicBusinessCatalog,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
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

let publicRegistrySourcePortForTests: PublicRegistrySourcePort | undefined
let catalogSearchPortForTests: CatalogSearchPort | undefined
let catalogSearchBackendForTests: CatalogSearchBackend | undefined

export function setPublicRegistrySourcePortForTests(port: PublicRegistrySourcePort): () => void {
  const previous = publicRegistrySourcePortForTests
  publicRegistrySourcePortForTests = port
  return () => {
    publicRegistrySourcePortForTests = previous
  }
}

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
  if (publicRegistrySourcePortForTests !== undefined) {
    return publicRegistrySourcePortForTests
  }

  if (usesLocalE2eBypass()) {
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
  }
}

function createLegacyRegistrySourcePort(): PublicRegistrySourcePort {
  return {
    list: (input) => Promise.resolve(legacyPublicRegistryList(input)),
    search: (input) => Promise.resolve(legacyPublicRegistrySearch(input)),
    detail: (input) => Promise.resolve(legacyPublicRegistryDetail(input)),
  }
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

async function filterPublicRegistryPage(
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

async function filterPublicRegistryDetail(
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
  } catch {
    if (shouldFallbackToLegacyRegistry()) {
      return fallback()
    }
    throw new Error('registry_query_failed')
  }
}

function shouldFallbackToLegacyRegistry(): boolean {
  return usesLocalE2eBypass() || process.env.NODE_ENV !== 'production'
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
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
