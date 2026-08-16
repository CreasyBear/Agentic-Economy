import { createFileRoute } from '@tanstack/react-router'

import { captureLegacyRegistryApiRequest } from '@/lib/observability/posthog.server'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { registryListAction } from '@/modules/registry/registry.actions'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { optionalHasPrice, optionalMaxPrice, optionalSearchLocation, optionalSearchMode } from '@/lib/http/search-query'
import type { Action, ActionResult } from '@/modules/common/action'
export const Route = createFileRoute('/api/businesses')({
  server: {
    handlers: {
      GET: ({ request }) => {
        captureLegacyRegistryApiRequest('businesses', 'list')
        return withHttpRateLimit(request, 'public-read', () => handleDurableListBusinessesRequest(request))
      },
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
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
    return problem({
      status: 400,
      kind: 'FAILED_PRECONDITION',
      code: 'unsupported_query_parameter',
      detail: `This endpoint lists ${options.collection} and does not accept a search term. Use ${searchPath} to search.`,
      extras: { unsupported, supported: [...LIST_QUERY_PARAMS] },
    })
  }

  const parsed = options.action.schema.safeParse({
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })
  if (!parsed.success) {
    return problem({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_query_parameter',
      detail: parsed.error.issues[0]?.message ?? 'Invalid query parameter.',
    })
  }

  return runRegistryAction(request, options.action, parsed.data)

}

async function runRegistryAction<Input, Result extends ActionResult>(
  request: Request,
  action: RegistryRouteAction<Input, Result>,
  data: Input,
): Promise<Response> {
  try {
    return jsonResponse(await action.run({
      data,
      context: { caller: 'http', request },
    }))
  } catch (error) {
    if (isInvalidRegistryCursorError(error)) {
      return problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_cursor',
        detail: 'The supplied pagination cursor is invalid or expired.',
      })
    }
    throw error
  }
}

function isInvalidRegistryCursorError(error: unknown): boolean {
  if (error instanceof Error && /(?:InvalidCursor|invalid[_ -]?cursor)/i.test(error.message)) {
    return true
  }
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return false
  }
  const data = error.data
  return typeof data === 'object'
    && data !== null
    && 'paginationError' in data
    && data.paginationError === 'InvalidCursor'
}

export async function runRegistrySearchRequest<Input, Result extends ActionResult>(
  request: Request,
  action: RegistryRouteAction<Input, Result>,
): Promise<Response> {
  const url = new URL(request.url)
  const rawMode = url.searchParams.get('mode')
  const normalizedMode = optionalSearchMode(rawMode)
  if (rawMode !== null && rawMode.trim().length > 0 && normalizedMode.mode === undefined) {
    return problem({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_query_parameter',
      detail: 'Invalid search mode.',
    })
  }

  const parsed = action.schema.safeParse({
    query: url.searchParams.get('q') ?? '',
    ...normalizedMode,
    ...optionalSearchLocation(url.searchParams.get('location')),
    ...optionalMaxPrice(
      url.searchParams.get('max_price_currency'),
      url.searchParams.get('max_price_units'),
      url.searchParams.get('max_price_exponent'),
    ),
    ...optionalHasPrice(url.searchParams.get('has_price')),
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })
  if (!parsed.success) {
    return problem({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_query_parameter',
      detail: parsed.error.issues[0]?.message ?? 'Invalid query parameter.',
    })
  }

  return runRegistryAction(request, action, parsed.data)
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

  return Number(value)
}


export function optionalCursor(value: string | null): { cursor?: string } {
  if (value === null) {
    return {}
  }

  return { cursor: value.trim() }
}

export function optionalLimit(value: string | null): { limit?: number } {
  const limit = numericParam(value)
  return limit === undefined ? {} : { limit }
}
