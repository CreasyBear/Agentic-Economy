import { createFileRoute } from '@tanstack/react-router'
import { Activity } from 'lucide-react'

import { AeActivity } from '@/components/ae/activity/AeActivity'
import type { ActivityLoaderResult } from '@/components/ae/activity/activity.contracts'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
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
  validateSearch: (search: Record<string, unknown>): { agent?: string } => {
    const agent = typeof search.agent === 'string' && search.agent.trim().length > 0
      ? search.agent.trim()
      : undefined
    return { ...(agent === undefined ? {} : { agent }) }
  },
  loaderDeps: ({ search: { agent } }) => ({ agent }),
  loader: async (ctx): Promise<ActivityLoaderResult> => {
    const agent = ctx?.deps?.agent
    const periodStart = new Date().toISOString().slice(0, 7)
    const period = agent
      ? { dimensionKind: 'agent' as const, dimensionRef: agent, periodKind: 'month' as const, periodStart }
      : { dimensionKind: 'account' as const, periodKind: 'month' as const, periodStart }
    const [calls, usage, spend] = await Promise.allSettled([
      readOwnerCallsServer({ data: agent ? { principalRef: agent } : {} }),
      readOwnerUsageServer({ data: period }),
      readOwnerSpendServer({ data: period }),
    ])
    for (const result of [calls, usage, spend]) {
      if (result.status === 'rejected') captureRouteException(result.reason, { 'ae.surface': 'operator_activity_loader' })
    }
    if (calls.status === 'rejected') return { kind: 'unavailable' }
    return {
      kind: 'available',
      calls: calls.value,
      usage: usage.status === 'fulfilled' ? usage.value : { kind: 'unavailable', code: 'source_unavailable' },
      spend: spend.status === 'fulfilled' ? spend.value : { kind: 'unavailable', code: 'source_unavailable' },
      periodStart,
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
  return <AeActivity result={result} />
}
