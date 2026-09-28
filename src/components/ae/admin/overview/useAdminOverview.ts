import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { formatCount, formatPercent } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/money/public'
import { adminObjectHref } from '@/lib/operator/admin-console/contracts'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'
import { ADMIN_EXCEPTION_PARTITION_LABELS, ADMIN_EXCEPTIONS_COPY } from '../exceptions/exceptions.contracts'
import { ADMIN_METRICS_COPY } from '../metrics/metrics.contracts'
import {
  ADMIN_OBJECT_KIND_OPTIONS,
  ADMIN_RECENT_REFS_STORAGE_KEY,
  adminRecentRefsSchema,
} from '../object-search/object-search.contracts'
import {
  ADMIN_OVERVIEW_COPY,
  exceptionKindLabel,
  type AdminConfiguredState,
  type AdminOverviewDataState,
  type AdminOverviewExceptionRow,
  type AdminOverviewExceptionsState,
  type AdminOverviewMetricsState,
  type AdminOverviewRecentRow,
} from './overview.contracts'


export function useAdminOverview(formance: AdminConfiguredState): AdminOverviewDataState {
  const overview = useQuery(api.adminConsoleOverview.readAdminOverview, {})
  const [recent] = useState(readRecentAdminRefs)
  if (overview === undefined) return { kind: 'loading' }
  if ('kind' in overview) return { kind: 'refused' }
  return { kind: 'ready', configuration: { formance, ...overview }, recent }
}
export function useOverviewExceptions(): AdminOverviewExceptionsState {
  const exceptions = useQuery(api.adminConsoleExceptions.readAdminExceptionOverview, {})
  if (exceptions === undefined) return { kind: 'loading' }
  if (!Array.isArray(exceptions)) return { kind: 'refused' }
  const rows = exceptions
    .filter((entry) => entry.observed > 0 || !entry.complete || entry.unavailable)
    .map((entry): AdminOverviewExceptionRow => ({
      id: `${entry.kind}:${entry.partition}`,
      label: `${exceptionKindLabel(entry.kind)} · ${ADMIN_EXCEPTION_PARTITION_LABELS[entry.partition]}`,
      href: `/admin/exceptions?kind=${entry.kind}&partition=${entry.partition}`,
      count: entry.unavailable ? ADMIN_EXCEPTIONS_COPY.unavailable
        : `${entry.complete ? '' : '≥'}${entry.observed} observed`,
    }))
  return { kind: 'ready', rows, unavailable: exceptions.some((entry) => entry.unavailable) }
}

export function useOverviewMetrics(): AdminOverviewMetricsState {
  const metrics = useQuery(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
  if (metrics === undefined) return { kind: 'loading' }
  if ('kind' in metrics) return { kind: 'refused' }
  if (metrics.headline === null) return { kind: 'empty' }
  return {
    kind: 'ready',
    headline: {
      settledCallValue: metrics.headline.money === 'no_settled_usage' || metrics.headline.settledCallValue === null
        ? ADMIN_METRICS_COPY.noSettledUsage : formatCurrencyAmount(metrics.headline.settledCallValue),
      settledCalls: formatCount(metrics.headline.settledCalls),
      successRate: metrics.headline.successRate === null ? ADMIN_OVERVIEW_COPY.notAvailable : formatPercent(metrics.headline.successRate),
      transactingWorkspaces: formatCount(metrics.headline.transactingWorkspaces),
    },
  }
}



function readRecentAdminRefs(): readonly AdminOverviewRecentRow[] {
  try {
    const stored = window.localStorage.getItem(ADMIN_RECENT_REFS_STORAGE_KEY)
    const parsed: unknown = stored === null ? [] : JSON.parse(stored)
    const recents = adminRecentRefsSchema.safeParse(parsed)
    if (!recents.success) return []
    return recents.data.flatMap((recent) => {
      const parsedRef = parseAdminObjectRef(recent.kind, recent.ref)
      if (parsedRef.kind === 'malformed') return []
      const label = ADMIN_OBJECT_KIND_OPTIONS.find((option) => option.value === recent.kind)?.label
      return label === undefined ? [] : [{ ...recent, label, href: adminObjectHref(parsedRef.ref) }]
    })
  } catch (cause) {
    void cause
    return []
  }
}
