import { createFileRoute } from '@tanstack/react-router'

import { kindForStatus } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { defineRouteHandlers, executeCorrelatedJsonRoute } from '@/lib/server/gateway-json-route'
import { problem } from '@/lib/server/problem'
import { marketWindowSchema } from '@/modules/market/contracts'
import { readMarketPageProjection } from '@/modules/market/server'

export const Route = createFileRoute('/api/v1/market-metrics')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => handleMarketMetricsRequest(request),
      HEAD: ({ request }) => handleMarketMetricsRequest(request, true),
    }),
  },
})

export async function handleMarketMetricsRequest(request: Request, head = false): Promise<Response> {
  return await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const rawWindow = new URL(request.url).searchParams.get('window') ?? '30d'
      const parsed = marketWindowSchema.safeParse(rawWindow)
      if (!parsed.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_window', detail: 'window must be 24h, 7d, or 30d' })
      const projection = await readMarketPageProjection(parsed.data)
      const headers = { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=240' }
      return head ? new Response(null, { status: 200, headers }) : Response.json(projection, { headers })
    },
    (error) => marketMetricsError(error),
  )
}
function marketMetricsError(error: unknown): Response {
  if (error instanceof ConvexSourceError) return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
  return problem({ status: 503, kind: 'UNAVAILABLE', code: 'market_metrics_unavailable' })
}
