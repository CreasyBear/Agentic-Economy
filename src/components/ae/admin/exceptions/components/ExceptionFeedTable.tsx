import type { ColumnDef } from '@tanstack/react-table'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  ADMIN_EXCEPTIONS_COPY,
  type AdminExceptionRowModel,
  type ExceptionFeedTableProps,
} from '../exceptions.contracts'

const columns: ColumnDef<AdminExceptionRowModel, unknown>[] = [
  {
    accessorKey: 'kindLabel',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.kind,
  },
  {
    accessorKey: 'ref',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.reference,
    cell: ({ row }) => (
      <a className="font-medium text-foreground underline-offset-4 hover:underline" href={row.original.href}>
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
          <a className="font-medium text-foreground underline-offset-4 hover:underline" href={row.original.businessHref}>
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
        <span className="text-xs text-muted-foreground">{row.original.sinceRelativeLabel}</span>
      </div>
    ),
  },
]

export function ExceptionFeedTable({ rows, filtered, total, truncated, unavailable, onOpen }: ExceptionFeedTableProps) {
  return (
    <AeSection
      title={ADMIN_EXCEPTIONS_COPY.exceptionsTitle}
      description={truncated ? ADMIN_EXCEPTIONS_COPY.showingOldest(total) : ADMIN_EXCEPTIONS_COPY.exceptionsDescription}
    >
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        hideFilter
        caption={ADMIN_EXCEPTIONS_COPY.exceptionsTitle}
        emptyMessage={unavailable && rows.length === 0
          ? ADMIN_EXCEPTIONS_COPY.exceptionsUnavailable
          : filtered
            ? ADMIN_EXCEPTIONS_COPY.noFilterMatches
            : ADMIN_EXCEPTIONS_COPY.nothingNeedsAttention}
        rowAction={{
          kind: 'button',
          label: ADMIN_EXCEPTIONS_COPY.viewDetails,
          onOpen,
          getAccessibleLabel: (row) => `${ADMIN_EXCEPTIONS_COPY.viewDetails}: ${row.ref}`,
        }}
      />
    </AeSection>
  )
}
