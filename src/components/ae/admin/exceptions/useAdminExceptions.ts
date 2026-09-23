import { useState } from 'react'
import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import type { AdminException } from '@/lib/operator/admin-console/contracts'
import {
  aeStatusValues,
  getStatusPresentation,
} from '@/lib/ui/status-presentation'
import { formatRelativeTime, timestampIso } from '@/lib/ui/format-time'
import {
  ADMIN_EXCEPTION_KIND_LABELS,
  isAdminExceptionFeed,
  type AdminExceptionRowModel,
  type AdminExceptionsDataState,
  type AdminExceptionsPageProps,
  type AdminResolutionRow,
  type AdminResolutionRowModel,
} from './exceptions.contracts'

const perthTimestampFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Australia/Perth',
})

export function useAdminExceptions({ search, onSearchChange }: AdminExceptionsPageProps) {
  const [selectedRow, setSelectedRow] = useState<AdminExceptionRowModel | null>(null)
  const feed = useQuery(api.adminConsoleExceptions.listAdminExceptions, {
    kind: search.kind ?? null,
  })
  const resolutions = useQuery(api.adminConsoleExceptions.listRecentPurchaseResolutions, {})

  const data: AdminExceptionsDataState = feed === undefined || resolutions === undefined
    ? { kind: 'loading' }
    : !isAdminExceptionFeed(feed) || !Array.isArray(resolutions)
      ? { kind: 'refused' }
      : {
          kind: 'ready',
          total: feed.total,
          truncated: feed.truncated,
          counts: feed.counts,
          rows: feed.items.map(toExceptionRowModel),
          resolutions: resolutions.map(toResolutionRowModel),
          selectedSourceUnavailable: search.kind === undefined
            ? feed.unavailable.length > 0
            : feed.unavailable.includes(search.kind),
          unavailableLabels: feed.unavailable.map((kind) => ADMIN_EXCEPTION_KIND_LABELS[kind]),
        }

  return {
    data,
    selectedRow,
    filtered: search.kind !== undefined,
    onSelectKind: (kind: AdminExceptionsPageProps['search']['kind'] | null) => {
      onSearchChange(kind === null ? {} : { kind })
    },
    onClear: () => onSearchChange({}),
    onOpen: setSelectedRow,
    onOpenChange: (open: boolean) => {
      if (!open) setSelectedRow(null)
    },
  }
}

function toExceptionRowModel(exception: AdminException): AdminExceptionRowModel {
  const ref = exceptionRef(exception)
  const businessSlug = 'businessSlug' in exception ? exception.businessSlug : null
  return {
    id: `${exception.kind}:${ref}`,
    kind: exception.kind,
    kindLabel: ADMIN_EXCEPTION_KIND_LABELS[exception.kind],
    ref,
    href: exceptionHref(exception),
    businessSlug,
    businessHref: businessSlug === null
      ? null
      : `/admin/providers/${encodeURIComponent(businessSlug)}`,
    sinceLabel: perthTimestampFormatter.format(exception.since),
    sinceRelativeLabel: formatRelativeTime(exception.since),
    sinceIso: timestampIso(exception.since),
    exception,
  }
}

function toResolutionRowModel(row: AdminResolutionRow): AdminResolutionRowModel {
  const status = aeStatusValues.find((candidate) => candidate === row.terminalState)
  return {
    callRef: row.callRef,
    href: `/admin/calls/${encodeURIComponent(row.callRef)}`,
    terminalStateLabel: status === undefined
      ? row.terminalState
      : getStatusPresentation(status).label,
    resolvedAtLabel: perthTimestampFormatter.format(row.resolvedAt),
    resolvedAtIso: timestampIso(row.resolvedAt),
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
