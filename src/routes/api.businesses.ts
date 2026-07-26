import { createFileRoute } from '@tanstack/react-router'

import { registryListAction } from '@/modules/registry/registry.actions'

export const Route = createFileRoute('/api/businesses')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableListBusinessesRequest(request),
    },
  },
})

const LIST_QUERY_PARAMS = new Set(['cursor', 'limit'])

/**
 * Browse takes no query term. Silently dropping one returns an arbitrary page
 * with HTTP 200, and a calling agent cannot tell that its question was
 * discarded — it just receives confident, unrelated businesses. Name the
 * unsupported parameter and point at the endpoint that does search.
 */
export async function handleDurableListBusinessesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const unsupported = [...new Set(url.searchParams.keys())].filter((key) => !LIST_QUERY_PARAMS.has(key)).sort()
  if (unsupported.length > 0) {
    return jsonResponse({
      kind: 'refused',
      reason: 'unsupported_query_parameter',
      unsupported,
      supported: [...LIST_QUERY_PARAMS],
      detail: 'This endpoint lists businesses and does not accept a search term. Use /api/businesses/search?q= to search.',
    }, { status: 400 })
  }

  return jsonResponse(await registryListAction.run({
    data: registryListAction.schema.parse({
      ...optionalCursor(url.searchParams.get('cursor')),
      ...optionalLimit(url.searchParams.get('limit')),
    }),
    context: { caller: 'http', request },
  }))
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
