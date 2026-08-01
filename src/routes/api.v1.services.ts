import { createFileRoute } from '@tanstack/react-router'

import { registryServicesListAction } from '@/modules/registry/registry.actions'
import {
  jsonResponse,
  optionalCursor,
  optionalLimit,
} from './api.businesses'

const LIST_QUERY_PARAMS = new Set(['cursor', 'limit'])

export const Route = createFileRoute('/api/v1/services')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableListServicesRequest(request),
    },
  },
})

export async function handleDurableListServicesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const unsupported = [...new Set(url.searchParams.keys())].filter((key) => !LIST_QUERY_PARAMS.has(key)).sort()
  if (unsupported.length > 0) {
    return jsonResponse({
      kind: 'refused',
      reason: 'unsupported_query_parameter',
      unsupported,
      supported: [...LIST_QUERY_PARAMS],
      detail: 'This endpoint lists services and does not accept a search term. Use /api/v1/services/search?q= to search.',
    }, { status: 400 })
  }

  return jsonResponse(await registryServicesListAction.run({
    data: registryServicesListAction.schema.parse({
      ...optionalCursor(url.searchParams.get('cursor')),
      ...optionalLimit(url.searchParams.get('limit')),
    }),
    context: { caller: 'http', request },
  }))
}
