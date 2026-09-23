import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { adminObjectHref, isAdminExceptionFeed, type AdminException } from '@/lib/operator/admin-console/contracts'
import { exceptionHref, exceptionRef } from '@/lib/operator/admin-console/exception-projection'
import { formatCount, formatPercent, formatPerthTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/money/public'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'
import {
  ADMIN_OBJECT_KIND_OPTIONS,
  ADMIN_RECENT_REFS_STORAGE_KEY,
  adminRecentRefsSchema,
} from '../object-search/object-search.contracts'
import { ADMIN_METRICS_COPY } from '../metrics/metrics.contracts'
import {
  ADMIN_OVERVIEW_COPY,
  exceptionKindLabel,
  type AdminConfiguredState,
  type AdminOverviewDataState,
  type AdminOverviewExceptionRow,
  type AdminOverviewRecentRow,
} from './overview.contracts'


export function useAdminOverview(formance: AdminConfiguredState): AdminOverviewDataState {
  const overview = useQuery(api.adminConsoleOverview.readAdminOverview, {})
  const exceptions = useQuery(api.adminConsoleExceptions.listAdminExceptions, { kind: null })
  const metrics = useQuery(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
  const [recent] = useState(readRecentAdminRefs)

  if (overview === undefined || exceptions === undefined || metrics === undefined) {
    return { kind: 'loading' }
  }
  if ('kind' in overview || !isAdminExceptionFeed(exceptions) || 'kind' in metrics) {
    return { kind: 'refused' }
  }
  return {
    kind: 'ready',
    configuration: { formance, ...overview },
    exceptions: exceptions.items.map(toExceptionRow).slice(0, 8),
    exceptionsUnavailable: exceptions.unavailable.length > 0,
    exceptionsTotal: exceptions.total,
    headline: {
      settledCallValue: metrics.headline.money === 'no_settled_usage'
        || metrics.headline.settledCallValue === null
        ? ADMIN_METRICS_COPY.noSettledUsage
        : formatCurrencyAmount(metrics.headline.settledCallValue),
      settledCalls: formatCount(metrics.headline.settledCalls),
      successRate: metrics.headline.successRate === null
        ? ADMIN_OVERVIEW_COPY.notAvailable
        : formatPercent(metrics.headline.successRate),
      transactingWorkspaces: formatCount(metrics.headline.transactingWorkspaces),
    },
    recent,
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

function toExceptionRow(exception: AdminException): AdminOverviewExceptionRow {
  const ref = exceptionRef(exception)
  return {
    id: `${exception.kind}:${ref}`,
    label: exceptionKindLabel(exception.kind),
    ref,
    href: exceptionHref(exception),
    since: formatPerthTimestamp(exception.since),
  }
}
