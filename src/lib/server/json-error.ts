import { kindForStatus, defaultTitle } from '@/lib/errors'
import { problem } from '@/lib/server/problem'

/**
 * RFC 9457 `application/problem+json` error helper. `code` is the stable
 * machine token; the canonical `kind` is derived from the HTTP status.
 */
export function jsonError(code: string, status: number, retryAfterMs?: number): Response {
  const headers: Record<string, string> = retryAfterMs === undefined
    ? {}
    : { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1_000))) }
  const kind = kindForStatus(status)
  return problem(
    {
      status,
      kind,
      code,
      retryable: status === 429,
    },
    headers,
  )
}
