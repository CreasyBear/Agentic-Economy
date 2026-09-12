import { createFileRoute } from '@tanstack/react-router'

import { degrade } from '@/lib/observability/degrade'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { readFundingConstraints } from '@/modules/money/public'

export const Route = createFileRoute('/api/v1/funding/constraints')({
  server: {
    handlers: {
      GET: ({ request }) => handleFundingConstraintsRequest(request),
      HEAD: ({ request }) => handleFundingConstraintsRequest(request, true),
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

export async function handleFundingConstraintsRequest(request: Request, head = false): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      response = await withHttpRateLimit(request, 'public-read', async () => {
        const constraints = readFundingConstraints()
        if (constraints === undefined) {
          return problem({
            status: 503,
            kind: 'UNAVAILABLE',
            code: 'funding_constraints_unavailable',
            retryable: true,
          })
        }
        return Response.json(constraints, {
          headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=60' },
        })
      })
    } catch (cause) {
      response = degrade(cause, problem({
        status: 503,
        kind: 'UNAVAILABLE',
        code: 'funding_constraints_unavailable',
        retryable: true,
      }), { site: 'handleFundingConstraintsRequest', reason: 'source_unavailable' })
    }
    const projected = head
      ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
      : response
    return withRequestCorrelationHeader(projected, correlationId)
  })
}
