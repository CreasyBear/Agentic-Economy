import { methodNotAllowed } from '@/lib/server/method-guard'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT'

const ALL_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'TRACE',
  'CONNECT',
]

export type RouteHandler<TParams = Record<string, string>> = (context: { request: Request; params: TParams }) => Promise<Response> | Response

export async function executeCorrelatedJsonRoute(
  request: Request,
  rateLimitKey: 'public-read' | 'public-mutation',
  handler: (correlationId: string) => Promise<Response>,
  catchError?: (cause: unknown) => Response,
  preValidate?: () => Promise<Response | null> | Response | null,
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let res: Response
    try {
      const invalid = preValidate ? await preValidate() : null
      if (invalid !== null) {
        res = invalid
      } else {
        res = await withHttpRateLimit(request, rateLimitKey, () => handler(correlationId))
      }
    } catch (cause) {
      if (catchError) {
        res = catchError(cause)
      } else {
        throw cause
      }
    }
    return withRequestCorrelationHeader(res, correlationId)
  })
}

export function postOnlyRoute(
  handler: (request: Request) => Promise<Response> | Response,
): Record<HttpMethod, RouteHandler> {
  const allowed = ['POST'] as const
  return {
    POST: ({ request }) => handler(request),
    GET: () => methodNotAllowed(allowed),
    PUT: () => methodNotAllowed(allowed),
    PATCH: () => methodNotAllowed(allowed),
    DELETE: () => methodNotAllowed(allowed),
    HEAD: () => methodNotAllowed(allowed),
    OPTIONS: () => methodNotAllowed(allowed),
    TRACE: () => methodNotAllowed(allowed),
    CONNECT: () => methodNotAllowed(allowed),
  }
}

export function defineRouteHandlers<TParams = Record<string, string>>(
  supported: Partial<Record<HttpMethod, RouteHandler<TParams>>>,
): Record<HttpMethod, RouteHandler<TParams>> {
  const allowed = Object.keys(supported) as HttpMethod[]
  const handlers = {} as Record<HttpMethod, RouteHandler<TParams>>
  for (const method of ALL_METHODS) {
    const handler = supported[method]
    if (handler !== undefined) {
      handlers[method] = handler
    } else {
      handlers[method] = () => methodNotAllowed(allowed)
    }
  }
  return handlers
}
