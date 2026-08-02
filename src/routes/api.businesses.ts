import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { registryListAction } from '@/modules/registry/registry.actions'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { optionalHasPrice, optionalMaxPriceMinor, optionalSearchLocation, optionalSearchMode } from '@/lib/http/search-query'
import type { Action, ActionResult } from '@/modules/common/action'
export const Route = createFileRoute('/api/businesses')({
  server: {
    handlers: {
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleDurableListBusinessesRequest(request)),
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
  return runRegistryListRequest(request, { collection: 'businesses', action: registryListAction })
}

type RegistryCollection = 'businesses' | 'services'
type RegistryRouteAction<Input, Result extends ActionResult> = Pick<Action<Input, Result>, 'schema' | 'run'>

export async function runRegistryListRequest<Input, Result extends ActionResult>(
  request: Request,
  options: Readonly<{ collection: RegistryCollection; action: RegistryRouteAction<Input, Result> }>,
): Promise<Response> {
  const url = new URL(request.url)
  const unsupported = uniqueSorted([...url.searchParams.keys()].filter((key) => !LIST_QUERY_PARAMS.has(key)))
  if (unsupported.length > 0) {
    const searchPath = options.collection === 'businesses' ? '/api/businesses/search?q=' : '/api/v1/services/search?q='
    return jsonResponse({
      kind: 'refused',
      reason: 'unsupported_query_parameter',
      unsupported,
      supported: [...LIST_QUERY_PARAMS],
      detail: `This endpoint lists ${options.collection} and does not accept a search term. Use ${searchPath} to search.`,
    }, { status: 400 })
  }

  return jsonResponse(await options.action.run({
    data: options.action.schema.parse({
      ...optionalCursor(url.searchParams.get('cursor')),
      ...optionalLimit(url.searchParams.get('limit')),
    }),
    context: { caller: 'http', request },
  }))
}

export async function runRegistrySearchRequest<Input, Result extends ActionResult>(
  request: Request,
  action: RegistryRouteAction<Input, Result>,
): Promise<Response> {
  const url = new URL(request.url)
  return jsonResponse(await action.run({
    data: action.schema.parse({
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
