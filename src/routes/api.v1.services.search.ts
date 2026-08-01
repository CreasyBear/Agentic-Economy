import { createFileRoute } from '@tanstack/react-router'

import { registryServicesSearchAction } from '@/modules/registry/registry.actions'
import {
  optionalHasPrice,
  optionalMaxPriceMinor,
  optionalSearchLocation,
  optionalSearchMode,
} from '@/lib/http/search-query'
import {
  jsonResponse,
  optionalCursor,
  optionalLimit,
} from './api.businesses'

export const Route = createFileRoute('/api/v1/services/search')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableSearchServicesRequest(request),
    },
  },
})

export async function handleDurableSearchServicesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  return jsonResponse(await registryServicesSearchAction.run({
    data: registryServicesSearchAction.schema.parse({
      query: url.searchParams.get('q') ?? '',
      ...optionalSearchMode(url.searchParams.get('mode')),
      ...optionalSearchLocation(url.searchParams.get('location')),
      ...optionalMaxPriceMinor(url.searchParams.get('max_price_minor')),
      ...optionalHasPrice(url.searchParams.get('has_price')),
      ...optionalCursor(url.searchParams.get('cursor')),
      ...optionalLimit(url.searchParams.get('limit')),
    }),
    context: { caller: 'http', request },
  }))
}

