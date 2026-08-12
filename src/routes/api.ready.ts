import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import type { RequestCorrelation } from '@/lib/server/request-correlation'
import { readServerReadiness, type ServerReadinessOptions, type ServerReadinessResult } from '@/lib/server/readiness'

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: ({ request }) => handleReadyRequest(request),
      HEAD: ({ request }) => handleReadyRequest(request, {}, true),
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})

export async function handleReadyRequest(
  request: Request,
  options: ServerReadinessOptions = {},
  head = false,
): Promise<Response> {
  const { runWithRequestCorrelation, withRequestCorrelationHeader } = await import('@/lib/server/request-correlation')
  return await runWithRequestCorrelation(request, async ({ correlationId }: RequestCorrelation) => {
    const readiness = await readServerReadiness(options)
    const response = readiness.status === 'ready'
      ? Response.json(
          {
            status: 'ready',
            checks: { config: 'ready', convex: 'ready' },
            diagnostics: readiness.diagnostics,
          },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      : problem({
          status: 503,
          kind: 'UNAVAILABLE',
          code: 'server_not_ready',
          retryable: true,
          detail: 'Required server readiness checks did not pass.',
          extras: {
            checks: projectChecks(readiness.checks),
            diagnostics: readiness.diagnostics,
          },
        })
    const projected = head
      ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
      : response
    return withRequestCorrelationHeader(projected, correlationId)
  })
}

function projectChecks(checks: ServerReadinessResult['checks']): Record<string, unknown> {
  return Object.fromEntries(Object.entries(checks).map(([name, check]) => [
    name,
    check.status === 'ready' ? 'ready' : { status: 'failed', code: check.code ?? 'check_failed' },
  ]))
}
