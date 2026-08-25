import { problem } from '@/lib/server/problem'

/**
 * Keep requests whose raw API path cannot be represented by a concrete route
 * out of TanStack's HTML fallback. TanStack normalizes encoded dot segments
 * before route matching, so this boundary reads the incoming Node request URL
 * when the srvx runtime exposes it instead of relying on URL.pathname.
 */
type RawPathRequest = Pick<Request, 'url'> & {
  readonly runtime?: {
    readonly node?: {
      readonly req?: {
        readonly url?: string
      }
    }
  }
}

export function apiRequestBoundaryResponse(request: RawPathRequest): Response | undefined {
  const pathname = rawPathname(request.runtime?.node?.req?.url ?? request.url)
  if (pathname === undefined) return undefined

  if (pathname.startsWith('/api/') && pathname.split('/').some((segment) => /^(?:%2e|\.){1,2}$/iu.test(segment))) {
    return problem({
      status: 404,
      kind: 'NOT_FOUND',
      code: 'api_not_found',
      detail: 'No API resource exists at this path.',
    })
  }

  return undefined
}

function rawPathname(rawUrl: string): string | undefined {
  const pathStart = rawUrl.startsWith('/') ? 0 : rawUrl.indexOf('/', rawUrl.indexOf('://') + 3)
  if (pathStart < 0) return rawUrl.includes('://') ? '/' : undefined

  const path = rawUrl.slice(pathStart)
  const queryStart = path.search(/[?#]/u)
  return queryStart < 0 ? path : path.slice(0, queryStart)
}
