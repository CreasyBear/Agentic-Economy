import type { ColumnDef } from '@tanstack/react-table'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import {
  ADMIN_EXCEPTIONS_COPY,
  type AdminResolutionRowModel,
  type PurchaseResolutionTableProps,
} from '../exceptions.contracts'

const columns: ColumnDef<AdminResolutionRowModel, unknown>[] = [
  {
    accessorKey: 'callRef',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.call,
    cell: ({ row }) => (
      <a className="font-medium text-foreground underline-offset-4 hover:underline" href={row.original.href}>
        {row.original.callRef}
      </a>
    ),
  },
  {
    accessorKey: 'terminalStateLabel',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.terminalState,
    cell: ({ row }) => <Badge variant="outline">{row.original.terminalStateLabel}</Badge>,
  },
  {
    accessorKey: 'resolvedAtLabel',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.resolvedAt,
    cell: ({ row }) => (
      <time dateTime={row.original.resolvedAtIso}>{row.original.resolvedAtLabel}</time>
    ),
  },
]

export function PurchaseResolutionTable({ rows }: PurchaseResolutionTableProps) {
  return (
    <AeSection
      title={ADMIN_EXCEPTIONS_COPY.resolutionsTitle}
      description={ADMIN_EXCEPTIONS_COPY.resolutionsDescription}
    >
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.callRef}
        hideFilter
        caption={ADMIN_EXCEPTIONS_COPY.resolutionsTitle}
        emptyMessage={ADMIN_EXCEPTIONS_COPY.noRecentResolutions}
      />
    </AeSection>
  )
}
