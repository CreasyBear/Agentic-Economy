import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import type { ColumnDef } from '@tanstack/react-table'

import '../../RecordWorkspaceComposition.css'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/arc/badge/badge'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import {
  ADMIN_EXCEPTIONS_COPY,
  type AdminResolutionRowModel,
  type PurchaseResolutionTableProps,
} from '../exceptions.contracts'

const columns: ColumnDef<AeRecordTableFeatures, AdminResolutionRowModel, unknown>[] = [
  {
    accessorKey: 'callRef',
    meta: { truncate: true },
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.call,
    cell: ({ row }) => (
      <a className="arc-admin-record-link font-mono" href={row.original.href} title={row.original.callRef}>
        {row.original.callRef}
      </a>
    ),
  },
  {
    accessorKey: 'terminalStateLabel',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.terminalState,
    cell: ({ row }) => <Badge tone={row.original.terminalStateTone}>{row.original.terminalStateLabel}</Badge>,
  },
  {
    accessorKey: 'resolvedAtIso',
    header: ADMIN_EXCEPTIONS_COPY.columnLabels.resolvedAt,
    cell: ({ row }) => <RecordTime at={row.original.resolvedAtIso} />,
  },
]

export function PurchaseResolutionTable({ rows }: PurchaseResolutionTableProps) {
  return (
    <AeSection
      className="arc-market arc-admin-record-table-region"
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
