import { buildProblem, type ProblemInput } from '@/lib/errors'

/**
 * Build an RFC 9457 `application/problem+json` Response from a
 * {@link ProblemInput}. The canonical kind/status come from `src/lib/errors`;
 * headers merge (e.g. Retry-After, WWW-Authenticate, Vary, Allow) over the
 * default `Cache-Control: no-store`.
 */
export function problem(input: ProblemInput, headers: Readonly<Record<string, string>> = {}): Response {
  const details = buildProblem(input)
  return new Response(JSON.stringify(details), {
    status: details.status,
    // Content-Type + Cache-Control are reserved: a caller can pass extra headers
    // (Retry-After, WWW-Authenticate, ...) but cannot override these two.
    headers: {
      ...headers,
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store',
    },
  })
}
