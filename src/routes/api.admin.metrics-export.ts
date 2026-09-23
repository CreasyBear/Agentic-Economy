import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import { kindForStatus } from '@/lib/errors'
import { ADMIN_METRICS_CSV_HEADER, metricsCsvRow } from '@/lib/operator/admin-console/metrics-csv'
import { reportAdminInvariant } from '@/lib/observability/admin-event-props'
import {
  ConvexSourceError,
  createAuthenticatedSourceTransport,
} from '@/lib/server/convex-source'
import {
  defineRouteHandlers,
  executeCorrelatedJsonRoute,
} from '@/lib/server/gateway-json-route'
import { problem } from '@/lib/server/problem'

const rangeSchema = z.enum(['last_7', 'last_30', 'last_90'])

export const Route = createFileRoute('/api/admin/metrics-export')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => handleAdminMetricsExportRequest(request),
    }),
  },
})

export async function handleAdminMetricsExportRequest(request: Request): Promise<Response> {
  return await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const parsed = rangeSchema.safeParse(new URL(request.url).searchParams.get('range'))
      if (!parsed.success) {
        return problem({
          status: 400,
          kind: 'INVALID_ARGUMENT',
          code: 'invalid_metrics_range',
          detail: 'range must be last_7, last_30, or last_90.',
        })
      }
      const transport = await createAuthenticatedSourceTransport()
      const report = await transport.query(
        api.adminConsoleMetrics.readMarketplaceMetrics,
        { range: parsed.data },
      )
      if (!('days' in report)) {
        return problem({
          status: 403,
          kind: 'PERMISSION_DENIED',
          code: report.code,
          detail: 'Admin access is required to export marketplace metrics.',
        })
      }
      const csv = [ADMIN_METRICS_CSV_HEADER, ...report.days.map(metricsCsvRow)].join('\r\n')
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="marketplace-metrics-${parsed.data}.csv"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    },
    adminMetricsExportError,
  )
}


function adminMetricsExportError(error: unknown): Response {
  if (error instanceof ConvexSourceError) {
    return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
  }
  reportAdminInvariant(error instanceof Error ? error : new Error(String(error)))
  return problem({ status: 503, kind: 'UNAVAILABLE', code: 'admin_metrics_export_unavailable' })
}
