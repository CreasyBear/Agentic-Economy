import { useNavigate } from '@tanstack/react-router'
import { usePaginatedQuery, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { adminObjectHref, type AdminExceptionKind, type AdminExceptionPartition, type AdminResolutionRow } from '@/lib/operator/admin-console/contracts'
import { aeStatusValues, getStatusPresentation } from '@/lib/ui/status-presentation'
import { formatPerthTimestamp, formatRelativeTime, timestampIso } from '@/lib/ui/format-time'
import {
  ADMIN_EXCEPTION_PARTITIONS,
  ADMIN_EXCEPTION_KIND_LABELS,
  type AdminExceptionRecord,
  type AdminExceptionRowModel,
  type AdminExceptionsDataState,
  type AdminExceptionsPageProps,
  type AdminResolutionRowModel,
} from './exceptions.contracts'


export function useAdminExceptions({ search, onSearchChange }: AdminExceptionsPageProps) {
  const navigate = useNavigate()
  const kind = search.kind ?? 'uncertain_call'
  const partition = search.partition !== undefined && ADMIN_EXCEPTION_PARTITIONS[kind].includes(search.partition)
    ? search.partition : ADMIN_EXCEPTION_PARTITIONS[kind][0]
  const overview = useQuery(api.adminConsoleExceptions.readAdminExceptionOverview, {})
  const allowed = Array.isArray(overview)
  const pagination = usePaginatedQuery(
    api.adminConsoleExceptions.listAdminExceptionsPage,
    allowed ? { kind, partition } : 'skip',
    { initialNumItems: 50 },
  )
  const resolutions = useQuery(api.adminConsoleExceptions.listRecentPurchaseResolutions, allowed ? {} : 'skip')
  const exact = useQuery(
    api.adminConsoleExceptions.readAdminException,
    allowed && search.ref !== undefined && (kind === 'removal_dispute' || kind === 'admission_case')
      ? { kind, ref: search.ref } : 'skip',
  )
  const rows = pagination.results.map((exception) => toExceptionRowModel(exception, partition))
  const selectedRow = exact !== undefined && exact !== null && !('code' in exact)
    ? toExceptionRowModel(exact, partition)
    : rows.find((row) => row.kind === kind && row.ref === search.ref) ?? null
  const selectedOverview = allowed
    ? overview.find((entry) => entry.kind === kind && entry.partition === partition) : undefined
  const data: AdminExceptionsDataState = overview === undefined
    ? { kind: 'loading' }
    : !allowed ? { kind: 'refused' }
      : resolutions === undefined || pagination.status === 'LoadingFirstPage'
        ? { kind: 'loading' }
        : !Array.isArray(resolutions) ? { kind: 'refused' }
      : {
          kind: 'ready', selectedKind: kind, selectedPartition: partition,
          observed: rows.length,
          complete: pagination.status === 'Exhausted',
          overview,
          rows,
          resolutions: resolutions.map(toResolutionRowModel),
          selectedSourceUnavailable: selectedOverview?.unavailable ?? false,
          paginationStatus: pagination.status,
          loadMore: () => pagination.loadMore(50),
        }

  return {
    data,
    selectedRow,
    onSelectKind: (nextKind: AdminExceptionKind) => onSearchChange({ kind: nextKind }),
    onSelectPartition: (nextPartition: AdminExceptionPartition) => onSearchChange({ kind, partition: nextPartition }),
    onOpen: (row: AdminExceptionRowModel) => {
      if (row.kind === 'uncertain_call' || row.kind === 'source_authority_review') {
        void navigate({ href: row.href })
      } else {
        onSearchChange({ kind, partition, ref: row.ref })
      }
    },
    onOpenChange: (open: boolean) => { if (!open) onSearchChange({ kind, partition }) },
  }
}

function toExceptionRowModel(exception: AdminExceptionRecord, partition: AdminExceptionPartition): AdminExceptionRowModel {
  const ref = exception.kind === 'uncertain_call' ? exception.callRef
    : exception.kind === 'removal_dispute' ? exception.disputeRef
      : exception.kind === 'source_authority_review' ? exception.publicationRef : exception.caseRef
  const businessSlug = 'businessSlug' in exception ? exception.businessSlug : null
  return {
    id: `${exception.kind}:${ref}`, kind: exception.kind,
    kindLabel: ADMIN_EXCEPTION_KIND_LABELS[exception.kind], ref,
    href: exception.kind === 'uncertain_call' ? `/admin/calls/${encodeURIComponent(ref)}`
      : exception.kind === 'source_authority_review' ? `/admin/tools/${encodeURIComponent(ref)}`
        : `/admin/exceptions?kind=${exception.kind}&partition=${partition}&ref=${encodeURIComponent(ref)}`, businessSlug,
    businessHref: businessSlug === null ? null : `/admin/providers/${encodeURIComponent(businessSlug)}`,
    sinceLabel: formatPerthTimestamp(exception.since),
    sinceRelativeLabel: formatRelativeTime(exception.since),
    sinceIso: timestampIso(exception.since),
    state: 'state' in exception ? exception.state : null,
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
    terminalStateLabel: status === undefined ? row.terminalState : getStatusPresentation(status).label,
    resolvedAtLabel: formatPerthTimestamp(row.resolvedAt),
    resolvedAtIso: timestampIso(row.resolvedAt),
  }
}
