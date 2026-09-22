import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import { formatCsvRow } from '@/lib/export/csv-export'
import { kindForStatus } from '@/lib/errors'
import type { MarketplaceMetricDay } from '@/lib/operator/admin-console/metrics.contracts'
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
const CSV_HEADERS = [
  'day', 'settledCallValueUnits', 'settledCallValueExponent',
  'settledCallValueCurrency', 'money', 'settledCalls', 'attemptedCalls',
  'completedCalls', 'uncertainCalls', 'quotesCreated',
  'quotesConvertedAtClose', 'transactingWorkspaces', 'transactingAgents',
  'transactingProviders', 'transactingTools', 'returningWorkspaces',
  'terminalCalls', 'terminalCallsWithResolution',
] as const
export const ADMIN_METRICS_CSV_HEADER = formatCsvRow(CSV_HEADERS)

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

function metricsCsvRow(day: MarketplaceMetricDay): string {
  return formatCsvRow([
    day.day,
    day.settledCallValue?.units ?? 'Not configured',
    day.settledCallValue?.exponent,
    day.settledCallValue?.currency,
    day.money,
    day.settledCalls,
    day.attemptedCalls,
    day.completedCalls,
    day.uncertainCalls,
    day.quotesCreated,
    day.quotesConvertedAtClose,
    day.transactingWorkspaces,
    day.transactingAgents,
    day.transactingProviders,
    day.transactingTools,
    day.returningWorkspaces,
    day.terminalCalls,
    day.terminalCallsWithResolution,
  ])
}

function adminMetricsExportError(error: unknown): Response {
  if (error instanceof ConvexSourceError) {
    return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
  }
  return problem({ status: 503, kind: 'UNAVAILABLE', code: 'admin_metrics_export_unavailable' })
}
