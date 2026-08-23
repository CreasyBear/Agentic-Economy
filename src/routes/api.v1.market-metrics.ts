import { createFileRoute } from '@tanstack/react-router'

import { kindForStatus } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { marketWindowSchema } from '@/modules/market/contracts'
import { readMarketPageProjection } from '@/modules/market/server'

export const Route = createFileRoute('/api/v1/market-metrics')({
  server: {
    handlers: {
      GET: ({ request }) => handleMarketMetricsRequest(request),
      HEAD: ({ request }) => handleMarketMetricsRequest(request, true),
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

export async function handleMarketMetricsRequest(request: Request, head = false): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      response = await withHttpRateLimit(request, 'public-read', async () => {
        const rawWindow = new URL(request.url).searchParams.get('window') ?? '30d'
        const parsed = marketWindowSchema.safeParse(rawWindow)
        if (!parsed.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_window', detail: 'window must be 24h, 7d, or 30d' })
        const projection = await readMarketPageProjection(parsed.data)
        const headers = { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=240' }
        return head ? new Response(null, { status: 200, headers }) : Response.json(projection, { headers })
      })
    } catch (error) {
      response = marketMetricsError(error)
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
function marketMetricsError(error: unknown): Response {
  if (error instanceof ConvexSourceError) return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
  return problem({ status: 503, kind: 'UNAVAILABLE', code: 'market_metrics_unavailable' })
}
