import { createFileRoute } from '@tanstack/react-router'

import {
  createDefaultRegistrySourceState,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import { jsonResponse, optionalCursor, optionalLimit } from './api.businesses'

export const Route = createFileRoute('/api/businesses/search')({
  server: {
    handlers: {
      GET: ({ request }) => handleSearchBusinessesRequest(request),
    },
  },
})

export function handleSearchBusinessesRequest(request: Request): Response {
  const url = new URL(request.url)
  const state = createDefaultRegistrySourceState()
  const result = searchPublicBusinessCatalog(state, {
    query: url.searchParams.get('q') ?? '',
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })

  return jsonResponse(result)
}
