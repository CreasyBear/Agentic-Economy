import { z } from 'zod'

import { createFileRoute } from '@tanstack/react-router'

import { kindForStatus } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { defineRouteHandlers, executeCorrelatedJsonRoute } from '@/lib/server/gateway-json-route'
import { duplicateQueryParameterProblem, problem, zodIssueDetail } from '@/lib/server/problem'
import { marketWindowSchema } from '@/modules/market/contracts'
import { readMarketPageProjection } from '@/modules/market/server'

const marketMetricsQuerySchema = z.strictObject({ window: marketWindowSchema.default('30d') })

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
      const url = new URL(request.url)
      const duplicate = duplicateQueryParameterProblem(url)
      if (duplicate !== undefined) return duplicate
      const parsed = marketMetricsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
      if (!parsed.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter', detail: zodIssueDetail(parsed.error) })
      const projection = await readMarketPageProjection(parsed.data.window)
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
