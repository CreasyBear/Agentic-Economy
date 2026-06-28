import { createFileRoute } from '@tanstack/react-router'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { DefaultFunctionArgs, FunctionReference } from 'convex/server'

import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
} from '@/modules/registry/public'

type Env = Record<string, string | undefined>

export type PublicRegistryQueryClient = {
  list: (input: PublicBusinessCatalogQueryInput) => Promise<PublicBusinessCatalogApiPage>
  search: (input: PublicBusinessCatalogSearchInput) => Promise<PublicBusinessCatalogApiPage>
  detail: (input: { slug: string }) => Promise<PublicBusinessCatalogDetailResult>
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

let publicRegistryQueryClientForTests: PublicRegistryQueryClient | undefined

export const Route = createFileRoute('/api/businesses')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableListBusinessesRequest(request),
    },
  },
})

export function setPublicRegistryQueryClientForTests(client: PublicRegistryQueryClient): () => void {
  const previous = publicRegistryQueryClientForTests
  publicRegistryQueryClientForTests = client
  return () => {
    publicRegistryQueryClientForTests = previous
  }
}

export async function readPublicRegistryCatalogPage(
  input: PublicBusinessCatalogQueryInput
): Promise<PublicBusinessCatalogApiPage> {
  return getPublicRegistryQueryClient().list(input)
}

export async function readPublicRegistrySearchPage(
  input: PublicBusinessCatalogSearchInput
): Promise<PublicBusinessCatalogApiPage> {
  return getPublicRegistryQueryClient().search(input)
}

export async function readPublicRegistryBusinessDetail(input: {
  slug: string
}): Promise<PublicBusinessCatalogDetailResult> {
  return getPublicRegistryQueryClient().detail(input)
}

export async function handleDurableListBusinessesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const result = await readPublicRegistryCatalogPage({
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })

  return jsonResponse(result)
}

export function handleListBusinessesRequest(request: Request): Response {
  const url = new URL(request.url)
  const result = legacyPublicRegistryList({
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })

  return jsonResponse(result)
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  })
}

export function optionalParam(value: string | null): string | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

export function numericParam(value: string | null): number | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function optionalCursor(value: string | null): { cursor?: string } {
  const cursor = optionalParam(value)
  return cursor === undefined ? {} : { cursor }
}

export function optionalLimit(value: string | null): { limit?: number } {
  const limit = numericParam(value)
  return limit === undefined ? {} : { limit }
}

export function legacyPublicRegistryList(input: PublicBusinessCatalogQueryInput = {}): PublicBusinessCatalogApiPage {
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

function getPublicRegistryQueryClient(): PublicRegistryQueryClient {
  if (publicRegistryQueryClientForTests !== undefined) {
    return publicRegistryQueryClientForTests
  }

  const client = new ConvexHttpClient(readRequiredConvexUrl(process.env))
  return {
    list: (input) => client.query(listPublicBusinessCatalogQuery, input),
    search: (input) => client.query(searchPublicBusinessCatalogQuery, input),
    detail: (input) => client.query(getPublicBusinessCatalogBySlugQuery, input),
  }
}

function sourceQuery<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'query', 'public', Args, Result> {
  return makeFunctionReference<'query', Args, Result>(name)
}

function readRequiredConvexUrl(env: Env): string {
  const value = readEnv(env, 'CONVEX_URL') ?? readEnv(env, 'VITE_CONVEX_URL')
  if (value === undefined) {
    throw new Error('CONVEX_URL or VITE_CONVEX_URL is required for public registry Convex queries.')
  }

  return value
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
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
