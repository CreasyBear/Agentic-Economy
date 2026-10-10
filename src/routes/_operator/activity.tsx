import { monthlyDraftRefSearchSchema } from '@/lib/call-recovery/activity-return-scope'
import { createFileRoute } from '@tanstack/react-router'
import { Activity } from 'lucide-react'
import { z } from 'zod'

import { AeActivity } from '@/components/ae/activity/AeActivity'
import type { ActivityLoaderResult } from '@/components/ae/activity/activity.contracts'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { formatTimestamp } from '@/lib/ui/format-time'
import { BROWSER_READ_TIMEOUT_MS, awaitBoundedRead } from '@/lib/bounded-read'
import { readOwnerActivityPrimaryServer, readOwnerActivityReportsServer } from '@/lib/server/activity.functions'

export const Route = createFileRoute('/_operator/activity')({
  staticData: {
    nav: {
      label: 'Calls',
      header: { order: 2, audience: 'signed-in' },
      footer: { column: 'Market', order: 3 },
      operator: {
        roles: ['owner'],
        group: 'Buy',
        groupOrder: 0,
        order: 0,
        icon: Activity,
        tier: 'core',
        mobilePrimary: true,
        mobileOrder: 10,
      },
    },
  },
  ...operatorRouteOptions,
  validateSearch: z.object({
    draftRef: monthlyDraftRefSearchSchema,
    status: z.enum(['all', 'completed', 'refused', 'outcome_unknown']).optional().catch(undefined),
    agent: z.string().trim().min(1).max(200).optional(),
    range: z.enum(['all', 'today', '7d', '30d', 'month']).optional().catch(undefined),
  }),
  loaderDeps: ({ search: { agent, range } }) => ({ agent, range }),
  loader: {
    // Fresh primary data mounts once; optional financial reads remain separate.
    staleReloadMode: 'blocking',
    handler: async (ctx): Promise<ActivityLoaderResult> => {
      const agent = ctx?.deps?.agent
      const dateRangeFilter = ctx?.deps?.range ?? '30d'
      const now = new Date()
      const periodEndAt = now.getTime() + 1
      const periodStartAt = dateRangeFilter === 'all' ? 0
        : dateRangeFilter === 'today' ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
          : dateRangeFilter === 'month' ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
            : periodEndAt - (dateRangeFilter === '7d' ? 7 : 30) * 24 * 60 * 60 * 1_000
      const range = { periodStartAt, periodEndAt }
      const periodStart = dateRangeFilter === 'all' ? `All recorded history through ${formatTimestamp(periodEndAt, 'UTC')} UTC`
        : `${formatTimestamp(periodStartAt, 'UTC')} to ${formatTimestamp(periodEndAt, 'UTC')} UTC`
      // The router aborts the loader signal when it discards this match; this
      // controller also lets a failed primary read cancel its sibling.
      const reportsController = new AbortController()
      try {
        const signal = AbortSignal.any([AbortSignal.timeout(BROWSER_READ_TIMEOUT_MS),
          ...(ctx?.abortController?.signal === undefined ? [] : [ctx.abortController.signal])])
        const data = { ...range, ...(agent === undefined ? {} : { principalRef: agent }) }
        // Deferred data: started now, never awaited here, so totals cannot hold the rows.
        const reportsSignal = AbortSignal.any([signal, reportsController.signal])
        const reports = awaitBoundedRead(signal => readOwnerActivityReportsServer({ data, signal }), reportsSignal)
        reports.catch(() => {}) // The hook re-awaits and captures; this only prevents an unhandled rejection.
        const primary = await awaitBoundedRead(signal => readOwnerActivityPrimaryServer({ data, signal }), signal)
        if (primary.kind === 'unavailable') { reportsController.abort(); return primary }
        return {
          ...primary,
          usage: { kind: 'pending' },
          spend: { kind: 'pending' },
          periodStart,
          ...range,
          reports,
          dateRangeFilter,
          ...(agent === undefined ? {} : { filteredAgent: agent }),
        }
      } catch (cause) {
        reportsController.abort()
        if (ctx?.abortController?.signal.aborted) throw cause
        captureRouteException(cause, { 'ae.surface': 'operator_activity_loader' })
        return { kind: 'unavailable' }
      }
    },
  },
  head: () => ({ meta: [
    { title: 'Calls | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: ActivityRoute,
})

function ActivityRoute() {
  const result = Route.useLoaderData()
  const { draftRef, status } = Route.useSearch()
  return <AeActivity key={status ?? 'all'} initialStatus={status ?? 'all'} result={result} {...(draftRef === undefined ? {} : {draftRef})} />
}
