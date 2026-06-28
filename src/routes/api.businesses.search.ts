import { createFileRoute } from '@tanstack/react-router'

import {
  jsonResponse,
  legacyPublicRegistrySearch,
  optionalCursor,
  optionalLimit,
  readPublicRegistrySearchPage,
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
  const result = await readPublicRegistrySearchPage({
    query: url.searchParams.get('q') ?? '',
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })

  return jsonResponse(result)
}

export function handleSearchBusinessesRequest(request: Request): Response {
  const url = new URL(request.url)
  const result = legacyPublicRegistrySearch({
    query: url.searchParams.get('q') ?? '',
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })

  return jsonResponse(result)
}
