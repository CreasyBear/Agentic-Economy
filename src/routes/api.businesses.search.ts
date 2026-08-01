import { createFileRoute } from '@tanstack/react-router'

import { registrySearchAction } from '@/modules/registry/registry.actions'
import {
  optionalHasPrice,
  optionalMaxPriceMinor,
  optionalSearchLocation,
  optionalSearchMode,
} from '@/lib/http/search-query'
export { optionalHasPrice, optionalMaxPriceMinor } from '@/lib/http/search-query'
import {
  jsonResponse,
  optionalCursor,
  optionalLimit,
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

  return jsonResponse(await registrySearchAction.run({
    data: registrySearchAction.schema.parse({
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

