import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import type { ColumnDef } from '@tanstack/react-table'

import { Button } from '@/components/arc/button/button'
import '../../RecordWorkspaceComposition.css'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  ADMIN_EXCEPTIONS_COPY,
  type AdminExceptionRowModel,
  type ExceptionFeedTableProps,
} from '../exceptions.contracts'

const columns: ColumnDef<AeRecordTableFeatures, AdminExceptionRowModel, unknown>[] = [
  {
    accessorKey: 'kindLabel',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.kind,
  },
  {
    accessorKey: 'ref',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.reference,
    cell: ({ row }) => (
      <a className="arc-admin-record-link" href={row.original.href}>
        {row.original.ref}
      </a>
    ),
  },
  {
    accessorKey: 'businessSlug',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.business,
    cell: ({ row }) => row.original.businessHref === null || row.original.businessSlug === null
      ? ADMIN_EXCEPTIONS_COPY.unavailable
      : (
          <a className="arc-admin-record-link" href={row.original.businessHref}>
            {row.original.businessSlug}
          </a>
        ),
  },
  {
    accessorKey: 'sinceLabel',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.since,
    cell: ({ row }) => (
      <div className="grid gap-1">
        <time dateTime={row.original.sinceIso}>{row.original.sinceLabel}</time>
        <span className="arc-admin-record-context">{row.original.sinceRelativeLabel}</span>
      </div>
    ),
  },
]

export function ExceptionFeedTable({ rows, observed, complete, unavailable, orderLabel, paginationStatus, scanRequests, onLoadMore, onOpen, focusId, restoreFocus }: ExceptionFeedTableProps) {
  return (
    <AeSection
      title={ADMIN_EXCEPTIONS_COPY.exceptionsTitle}
      description={`${orderLabel}. ${observed} loaded${complete ? ' (exhausted)' : ' (partial)'}. ${ADMIN_EXCEPTIONS_COPY.exceptionsDescription}`}
    >
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        hideFilter
        caption={ADMIN_EXCEPTIONS_COPY.exceptionsTitle}
        emptyMessage={unavailable && rows.length === 0
          ? ADMIN_EXCEPTIONS_COPY.exceptionsUnavailable
          : paginationStatus !== 'Exhausted'
            ? 'No cases in this loaded page. Load more to continue.'
            : ADMIN_EXCEPTIONS_COPY.nothingNeedsAttention}
        rowActionFocus={{ ...(focusId === undefined ? {} : { currentId: focusId }), restore: restoreFocus ?? false }}
        rowAction={{
          kind: 'button',
          label: ADMIN_EXCEPTIONS_COPY.viewDetails,
          onOpen,
          getAccessibleLabel: (row) => `${ADMIN_EXCEPTIONS_COPY.viewDetails}: ${row.ref}`,
        }}
      />
      {rows.length === 0 && !complete && scanRequests > 0
        ? <p role="status" className="text-sm text-muted-foreground">{ADMIN_EXCEPTIONS_COPY.scanProgress(scanRequests)}</p>
        : null}
      {paginationStatus === 'Exhausted' ? null : (
        <Button type="button" variant="secondary" size="md" disabled={paginationStatus === 'LoadingMore'} onClick={onLoadMore}>
          {ADMIN_EXCEPTIONS_COPY.loadMore}
        </Button>
      )}
    </AeSection>
  )
}
