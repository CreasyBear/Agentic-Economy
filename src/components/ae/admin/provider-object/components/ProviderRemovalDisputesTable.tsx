import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderRemovalDisputeRow,
  type ProviderRemovalDisputesTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel, providerTimestamp } from '../provider-object.view-model'
import { ProviderDisputeAction } from './ProviderDisputeAction'

function disputeColumns(onCloseDispute?: ProviderRemovalDisputesTableProps['onCloseDispute']): ColumnDef<ProviderRemovalDisputeRow, unknown>[] { return [
  {
    accessorKey: 'disputeRef',
    header: PROVIDER_OBJECT_COPY.columns.removalDispute,
    cell: ({ row }) => (
      <AeCopyReference label={PROVIDER_OBJECT_COPY.columns.removalDispute} value={row.original.disputeRef} />
    ),
  },
  {
    accessorKey: 'status',
    header: PROVIDER_OBJECT_COPY.columns.state,
    cell: ({ row }) => providerStatusLabel(row.original.status),
  },
  {
    accessorKey: 'updatedAt',
    header: PROVIDER_OBJECT_COPY.columns.updated,
    cell: ({ row }) => {
      const updatedAt = providerTimestamp(row.original.updatedAt)
      return <time dateTime={updatedAt.iso}>{updatedAt.label}</time>
    },
  },
  {
    id: 'actions',
    header: PROVIDER_OBJECT_COPY.closeDispute,
    cell: ({ row }) => <ProviderDisputeAction dispute={row.original} onClose={onCloseDispute} />,
  },
]
}
export function ProviderRemovalDisputesTable({ rows, onCloseDispute }: ProviderRemovalDisputesTableProps) {
  return (
    <AeSection title={PROVIDER_OBJECT_COPY.removalDisputesTitle}>
      <AeRecordTable
        columns={disputeColumns(onCloseDispute)}
        data={rows}
        getRowId={(row) => row.disputeRef}
        hideFilter
        caption={PROVIDER_OBJECT_COPY.removalDisputesTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noRemovalDisputes}
      />
    </AeSection>
  )
}
