import type { ZodError } from 'zod'

import { buildProblem, defaultTitle, type ProblemInput } from '@/lib/errors'
import { currentRequestCorrelationId, REQUEST_CORRELATION_HEADER } from '@/lib/server/request-correlation'

/**
 * Build an RFC 9457 `application/problem+json` Response from a
 * {@link ProblemInput}. The canonical kind/status come from `src/lib/errors`;
 * headers merge (e.g. Retry-After, WWW-Authenticate, Vary, Allow) over the
 * default `Cache-Control: no-store`.
 *
 * `detail` cannot be omitted from the wire body: every problem carries a
 * human-readable, occurrence-specific explanation (RFC 9457 3.1). Callers are
 * encouraged to pass a specific `detail`; when one is not supplied, this
 * falls back to a generic-but-present title/code pairing rather than leaving
 * the field out.
 */
export function problem(input: ProblemInput, headers: Readonly<Record<string, string>> = {}): Response {
  const detail = input.detail ?? `${input.title ?? defaultTitle(input.kind)} (${input.code}).`
  const details = buildProblem({ ...input, detail })
  const responseHeaders = new Headers(headers)
  const correlationId = currentRequestCorrelationId()
  if (correlationId !== undefined) responseHeaders.set(REQUEST_CORRELATION_HEADER, correlationId)
  // Content-Type + Cache-Control are reserved: callers cannot override these.
  responseHeaders.set('Content-Type', 'application/problem+json')
  responseHeaders.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(details), {
    status: details.status,
    headers: responseHeaders,
  })
}

/** First zod issue as `"path: message"` (or just `message` for a root-level issue), for a `detail` that names the field. */
export function zodIssueDetail(error: ZodError): string {
  const issue = error.issues[0]
  if (issue === undefined) return 'Invalid input.'
  const path = issue.path.join('.')
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message
}

/**
 * Reject a query string that repeats the same key (`?limit=1&limit=999`)
 * before any route-specific parsing picks a winner. `/api/v1/registry` and
 * `/api/businesses` used to disagree here (last-value-wins vs
 * first-value-wins via `URLSearchParams.get`); both now refuse the request
 * outright and name the offending parameter.
 */
export function duplicateQueryParameterProblem(url: URL): Response | undefined {
  const seen = new Set<string>()
  for (const key of url.searchParams.keys()) {
    if (seen.has(key)) {
      return problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_query_parameter',
        detail: `Query parameter '${key}' must not be repeated.`,
      })
    }
    seen.add(key)
  }
  return undefined
}
