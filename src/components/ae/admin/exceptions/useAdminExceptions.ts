import { useState } from 'react'
import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { adminObjectHref, isAdminExceptionFeed, type AdminException, type AdminResolutionRow } from '@/lib/operator/admin-console/contracts'
import { exceptionHref, exceptionRef } from '@/lib/operator/admin-console/exception-projection'
import {
  aeStatusValues,
  getStatusPresentation,
} from '@/lib/ui/status-presentation'
import { formatPerthTimestamp, formatRelativeTime, timestampIso } from '@/lib/ui/format-time'
import {
  ADMIN_EXCEPTION_KIND_LABELS,
  type AdminExceptionRowModel,
  type AdminExceptionsDataState,
  type AdminExceptionsPageProps,
  type AdminResolutionRowModel,
} from './exceptions.contracts'


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
      : adminObjectHref({ kind: 'provider', ref: businessSlug }),
    sinceLabel: formatPerthTimestamp(exception.since),
    sinceRelativeLabel: formatRelativeTime(exception.since),
    sinceIso: timestampIso(exception.since),
    exception,
  }
}

function toResolutionRowModel(row: AdminResolutionRow): AdminResolutionRowModel {
  const status = aeStatusValues.find((candidate) => candidate === row.terminalState)
  const parsed = parseCallRef(row.callRef)
  return {
    callRef: row.callRef,
    href: parsed.kind === 'valid'
      ? adminObjectHref({ kind: 'call', ref: parsed.ref })
      : `/admin/calls/${encodeURIComponent(row.callRef)}`,
    terminalStateLabel: status === undefined
      ? row.terminalState
      : getStatusPresentation(status).label,
    resolvedAtLabel: formatPerthTimestamp(row.resolvedAt),
    resolvedAtIso: timestampIso(row.resolvedAt),
  }
}
