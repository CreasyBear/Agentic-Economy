import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
} from '@/modules/registry/public'

export type PublicRegistrySourcePort = {
  list: (input: PublicBusinessCatalogQueryInput) => Promise<PublicBusinessCatalogApiPage>
  search: (input: PublicBusinessCatalogSearchInput) => Promise<PublicBusinessCatalogApiPage>
  detail: (input: { slug: string }) => Promise<PublicBusinessCatalogDetailResult>
}

export type PublicRegistryQueryClient = PublicRegistrySourcePort

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

export function setPublicRegistrySourcePortForTests(port: PublicRegistrySourcePort): () => void {
  const previous = publicRegistrySourcePortForTests
  publicRegistrySourcePortForTests = port
  return () => {
    publicRegistrySourcePortForTests = previous
  }
}

export const setPublicRegistryQueryClientForTests = setPublicRegistrySourcePortForTests

export async function readPublicRegistryCatalogPage(
  input: PublicBusinessCatalogQueryInput
): Promise<PublicBusinessCatalogApiPage> {
  return getPublicRegistrySourcePort().list(input)
}

export async function readPublicRegistrySearchPage(
  input: PublicBusinessCatalogSearchInput
): Promise<PublicBusinessCatalogApiPage> {
  return getPublicRegistrySourcePort().search(input)
}

export async function readPublicRegistryBusinessDetail(input: {
  slug: string
}): Promise<PublicBusinessCatalogDetailResult> {
  return getPublicRegistrySourcePort().detail(input)
}

export function legacyPublicRegistryList(
  input: PublicBusinessCatalogQueryInput = {}
): PublicBusinessCatalogApiPage {
  return paginateLegacyCatalogs([legacyPublicRegistryCatalog()], input)
}

export function legacyPublicRegistrySearch(input: PublicBusinessCatalogSearchInput): PublicBusinessCatalogApiPage {
  const query = normalizeSearchText(input.query)
  if (query.length === 0) {
    return {
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      query: '',
      items: [],
      pagination: {
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        limit: normalizeLimit(input.limit),
        total: 0,
        hasMore: false,
      },
    }
  }

  const tokens = query.split(' ').map(normalizeSearchToken)
  const matches = [legacyPublicRegistryCatalog()].filter((catalog) => {
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
      ].join(' ')
    )
    return tokens.every((token) => haystack.includes(token))
  })

  return paginateLegacyCatalogs(matches, input, query)
}

export function legacyPublicRegistryDetail(input: { slug: string }): PublicBusinessCatalogDetailResult {
  const catalog = legacyPublicRegistryCatalog()
  if (catalog.slug !== normalizeSlug(input.slug)) {
    return {
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No public business catalog exists for this slug.',
    }
  }

  return {
    kind: 'found',
    schemaVersion: 'public-business-catalog-api:v1',
    business: catalog,
  }
}

function getPublicRegistrySourcePort(): PublicRegistrySourcePort {
  if (publicRegistrySourcePortForTests !== undefined) {
    return publicRegistrySourcePortForTests
  }

  if (usesLocalE2eBypass()) {
    return {
      list: (input) => Promise.resolve(legacyPublicRegistryList(input)),
      search: (input) => Promise.resolve(legacyPublicRegistrySearch(input)),
      detail: (input) => Promise.resolve(legacyPublicRegistryDetail(input)),
    }
  }

  return {
    list: (input) => callPublicSourceQuery(listPublicBusinessCatalogQuery, input),
    search: (input) => callPublicSourceQuery(searchPublicBusinessCatalogQuery, input),
    detail: (input) => callPublicSourceQuery(getPublicBusinessCatalogBySlugQuery, input),
  }
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}

function paginateLegacyCatalogs(
  items: readonly PublicBusinessCatalogApiDto[],
  input: PublicBusinessCatalogQueryInput,
  query?: string
): PublicBusinessCatalogApiPage {
  const limit = normalizeLimit(input.limit)
  const startIndex =
    input.cursor === undefined ? 0 : Math.max(items.findIndex((item) => item.slug === input.cursor), 0)
  const pageItems = items.slice(startIndex, startIndex + limit)
  const next = items.at(startIndex + limit)

  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v1',
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

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 50)
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

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function legacyPublicRegistryCatalog(): PublicBusinessCatalogApiDto {
  return {
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/parramatta-emergency-plumbing',
    trustTier: 'claimed',
    publicStatus: 'published',
    indexStatus: 'queued',
    discoveryStatus: 'degraded',
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: 2_000,
    services: [
      {
        slug: 'emergency-pipe-repair',
        name: 'Emergency pipe repair',
        category: 'Emergency plumbing',
        summary: 'Burst pipe triage and repair.',
        serviceArea: 'Parramatta and nearby suburbs',
        hoursOrUnknown: 'Owner supplied hours',
        firstRequest: {
          mode: 'not_available_yet',
          publicDisclosure: 'First request is not available yet.',
          publicChannel: 'not_available',
          noContactReason: 'Owner has not supplied public contact instructions.',
        },
        status: 'published',
        capabilities: [{ kind: 'phone_inquiry', status: 'unavailable' }],
      },
    ],
  }
}
