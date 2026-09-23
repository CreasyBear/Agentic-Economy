import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import type { AdminException } from '@/lib/operator/admin-console/contracts'
import { formatCurrencyAmount } from '@/modules/money/public'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'
import {
  ADMIN_OBJECT_KIND_OPTIONS,
  ADMIN_RECENT_REFS_STORAGE_KEY,
  adminObjectHref,
  adminRecentRefsSchema,
} from '../object-search/object-search.contracts'
import { ADMIN_METRICS_COPY } from '../metrics/metrics.contracts'
import {
  ADMIN_OVERVIEW_COPY,
  exceptionKindLabel,
  isAdminExceptionFeed,
  type AdminConfiguredState,
  type AdminOverviewDataState,
  type AdminOverviewExceptionRow,
  type AdminOverviewRecentRow,
} from './overview.contracts'

const perthDateTime = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Australia/Perth',
})
const numberFormatter = new Intl.NumberFormat('en-AU')
const percentFormatter = new Intl.NumberFormat('en-AU', {
  style: 'percent',
  maximumFractionDigits: 1,
})

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
      settledCalls: numberFormatter.format(metrics.headline.settledCalls),
      successRate: metrics.headline.successRate === null
        ? ADMIN_OVERVIEW_COPY.notAvailable
        : percentFormatter.format(metrics.headline.successRate),
      transactingWorkspaces: numberFormatter.format(metrics.headline.transactingWorkspaces),
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
    since: perthDateTime.format(exception.since),
  }
}

function exceptionRef(exception: AdminException): string {
  switch (exception.kind) {
    case 'uncertain_call': return exception.callRef
    case 'removal_dispute': return exception.disputeRef
    case 'source_authority_review': return exception.publicationRef
    case 'admission_case': return exception.caseRef
  }
}

function exceptionHref(exception: AdminException): string {
  switch (exception.kind) {
    case 'uncertain_call': return `/admin/calls/${encodeURIComponent(exception.callRef)}`
    case 'source_authority_review': return `/admin/tools/${encodeURIComponent(exception.publicationRef)}`
    case 'removal_dispute':
    case 'admission_case': return `/admin/providers/${encodeURIComponent(exception.businessSlug)}`
  }
}
