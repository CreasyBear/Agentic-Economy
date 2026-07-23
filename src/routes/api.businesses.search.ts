import { createFileRoute } from '@tanstack/react-router'

import { registrySearchAction } from '@/modules/registry/registry.actions'
import { legacyPublicRegistrySearch } from '@/modules/registry/registry.functions'
import {
  assertOnlySearchParams,
  jsonResponse,
  optionalCursor,
  optionalLimit,
  strictOptionalLimit,
} from './api.businesses'

export const Route = createFileRoute('/api/businesses/search')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableSearchBusinessesRequest(request),
    },
  },
})

export async function handleDurableSearchBusinessesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  assertOnlySearchParams(url.searchParams, ['q', 'mode', 'location', 'cursor', 'limit'])
  const data = registrySearchAction.schema.parse({
    query: url.searchParams.get('q') ?? '',
    ...strictOptionalSearchMode(url.searchParams.get('mode')),
    ...optionalSearchLocation(url.searchParams.get('location')),
    ...optionalCursor(url.searchParams.get('cursor')),
    ...strictOptionalLimit(url.searchParams.get('limit')),
  })
  const result = await registrySearchAction.run({ data, context: { request } })

  return jsonResponse(result)
}

export function handleSearchBusinessesRequest(request: Request): Response {
  const url = new URL(request.url)
  const result = legacyPublicRegistrySearch({
    query: url.searchParams.get('q') ?? '',
    ...optionalSearchMode(url.searchParams.get('mode')),
    ...optionalSearchLocation(url.searchParams.get('location')),
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })

  return jsonResponse(result)
}

function optionalSearchMode(
  value: string | null,
): { mode?: 'near_me' | 'whole_catalogue' } {
  if (value === 'near_me' || value === 'near') {
    return { mode: 'near_me' }
  }
  if (value === 'whole_catalogue' || value === 'catalogue' || value === 'catalog') {
    return { mode: 'whole_catalogue' }
  }
  return {}
}

function strictOptionalSearchMode(value: string | null): { mode?: string } {
  if (value === null || value.trim().length === 0) return {}
  if (value === 'near') return { mode: 'near_me' }
  if (value === 'catalogue' || value === 'catalog') return { mode: 'whole_catalogue' }
  return { mode: value }
}

function optionalSearchLocation(value: string | null): { location?: string } {
  const normalized = value?.trim().replace(/\s+/g, ' ').slice(0, 80)
  return normalized === undefined || normalized.length === 0
    ? {}
    : { location: normalized }
}
