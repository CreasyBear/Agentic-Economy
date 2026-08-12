import { buildProblem, type ProblemInput } from '@/lib/errors'
import { currentRequestCorrelationId, REQUEST_CORRELATION_HEADER } from '@/lib/server/request-correlation'

/**
 * Build an RFC 9457 `application/problem+json` Response from a
 * {@link ProblemInput}. The canonical kind/status come from `src/lib/errors`;
 * headers merge (e.g. Retry-After, WWW-Authenticate, Vary, Allow) over the
 * default `Cache-Control: no-store`.
 */
export function problem(input: ProblemInput, headers: Readonly<Record<string, string>> = {}): Response {
  const details = buildProblem(input)
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
