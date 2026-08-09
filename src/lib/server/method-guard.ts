import { problem } from '@/lib/server/problem'

/**
 * RFC 9457 405 for an API route that does not support this method. Adds the
 * standard `Allow` header. Routes that register only a subset of standard
 * methods should add explicit handlers for the others returning this, so a
 * wrong method doesn't fall through to the SPA shell.
 */
export function methodNotAllowed(allowed: readonly string[], detail?: string): Response {
  return problem(
    {
      status: 405,
      kind: 'METHOD_NOT_ALLOWED',
      code: 'method_not_allowed',
      detail: detail ?? `Only ${allowed.join(', ')} are supported by this route.`,
    },
    { Allow: allowed.join(', ') },
  )
}
