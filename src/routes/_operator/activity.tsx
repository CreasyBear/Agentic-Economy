import { monthlyDraftRefSearchSchema } from '@/lib/call-recovery/activity-return-scope'
import { createFileRoute } from '@tanstack/react-router'
import { Activity } from 'lucide-react'
import { z } from 'zod'

import { readOwnerUsageReconciliationServer } from '@/lib/server/usage-reconciliation.functions'
import { AeActivity } from '@/components/ae/activity/AeActivity'
import type { ActivityLoaderResult } from '@/components/ae/activity/activity.contracts'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import {
  readOwnerCallsServer,
  readOwnerSpendServer,
  readOwnerUsageServer,
} from '@/lib/server/call-history.functions'

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
    agent: z.string().trim().min(1).max(200).optional(),
    range: z.enum(['all', 'today', '7d', '30d', 'month']).optional().catch(undefined),
  }),
  loaderDeps: ({ search: { agent, range } }) => ({ agent, range }),
  loader: async (ctx): Promise<ActivityLoaderResult> => {
    const agent = ctx?.deps?.agent
    const dateRangeFilter = ctx?.deps?.range ?? '30d'
    const now = new Date()
    const periodEndAt = now.getTime() + 1
    const periodStartAt = dateRangeFilter === 'all' ? 0
      : dateRangeFilter === 'today' ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        : dateRangeFilter === 'month' ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
          : periodEndAt - (dateRangeFilter === '7d' ? 7 : 30) * 24 * 60 * 60 * 1_000
    const range = { periodStartAt, periodEndAt }
    const periodStart = dateRangeFilter === 'all' ? `All recorded history through ${formatUtcTimestamp(periodEndAt)} UTC`
      : `${formatUtcTimestamp(periodStartAt)} to ${formatUtcTimestamp(periodEndAt)} UTC`
    const aggregateRangeTooLarge = periodEndAt - periodStartAt > 366 * 24 * 60 * 60 * 1_000
    const period = agent
      ? { dimensionKind: 'agent' as const, dimensionRef: agent, ...range }
      : { dimensionKind: 'account' as const, ...range }
    const [calls, usage, spend, reconciliation] = await Promise.allSettled([
      readOwnerCallsServer({ data: { ...range, ...(agent === undefined ? {} : { principalRef: agent }) } }),
      aggregateRangeTooLarge ? Promise.resolve({ kind: 'unavailable' as const, code: 'usage_window_too_large' as const })
        : readOwnerUsageServer({ data: period }),
      agent !== undefined ? Promise.resolve({ kind: 'not_requested' as const })
        : aggregateRangeTooLarge ? Promise.resolve({ kind: 'unavailable' as const, code: 'formance_spend_window_too_large' })
          : readOwnerSpendServer({ data: period }),
      agent !== undefined ? Promise.resolve(undefined)
        : aggregateRangeTooLarge ? Promise.resolve({ kind: 'unavailable' as const, code: 'reconciliation_window_too_large' })
          : readOwnerUsageReconciliationServer({ data: range }),
    ])
    for (const result of [calls, usage, spend, reconciliation]) {
      if (result.status === 'rejected') captureRouteException(result.reason, { 'ae.surface': 'operator_activity_loader' })
    }
    if (calls.status === 'rejected') return { kind: 'unavailable' }
    return {
      kind: 'available',
      calls: calls.value,
      usage: usage.status === 'fulfilled' ? usage.value : { kind: 'unavailable', code: 'source_unavailable' },
      spend: spend.status === 'fulfilled' ? spend.value : { kind: 'unavailable', code: 'source_unavailable' },
      ...(reconciliation.status === 'fulfilled' && reconciliation.value !== undefined ? { reconciliation: reconciliation.value }
        : agent === undefined ? { reconciliation: { kind: 'unavailable' as const, code: 'source_unavailable' } } : {}),
      periodStart,
      ...range,
      dateRangeFilter,
      ...(agent === undefined ? {} : { filteredAgent: agent }),
    }
  },
  head: () => ({ meta: [
    { title: 'Calls | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: ActivityRoute,
})

function ActivityRoute() {
  const result = Route.useLoaderData()
  const {draftRef} = Route.useSearch()
  return <AeActivity result={result} {...(draftRef === undefined ? {} : {draftRef})} />
}
