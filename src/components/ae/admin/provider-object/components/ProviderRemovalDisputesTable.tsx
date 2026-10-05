import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderRemovalDisputeRow,
  type ProviderRemovalDisputesTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'
import { providerTimestamp } from '../provider-object.view-model'
import { ProviderDisputeAction } from './ProviderDisputeAction'

function disputeColumns(onCloseDispute?: ProviderRemovalDisputesTableProps['onCloseDispute']): DataColumn<ProviderRemovalDisputeRow>[] {
  return [
    {
      key: 'disputeRef',
      sortable: false,
      label: PROVIDER_OBJECT_COPY.columns.removalDispute,
      render: (_value, row) => (
        <AeCopyReference compact label={PROVIDER_OBJECT_COPY.columns.removalDispute} value={row.disputeRef} />
      ),
    },
    {
      key: 'status',
      sortable: false,
      label: PROVIDER_OBJECT_COPY.columns.state,
      render: (_value, row) => providerStatusLabel(row.status),
    },
    {
      key: 'updatedAt',
      sortable: false,
      label: PROVIDER_OBJECT_COPY.columns.updated,
      render: (_value, row) => {
        const updatedAt = providerTimestamp(row.updatedAt)
        return <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={updatedAt.iso}>{updatedAt.label}</time>
      },
    },
    {
      key: 'actions',
      sortable: false,
      label: PROVIDER_OBJECT_COPY.closeDispute,
      render: (_value, row) => <ProviderDisputeAction dispute={row} onClose={onCloseDispute} />,
    },
  ]
}
export function ProviderRemovalDisputesTable({ rows, onCloseDispute }: ProviderRemovalDisputesTableProps) {
  return (
    <AeSection title={PROVIDER_OBJECT_COPY.removalDisputesTitle}>
      <div className="ae-arc min-w-0">
        <SortableDataTable
          density="compact"
          columns={disputeColumns(onCloseDispute)}
          rows={rows}
          rowKey="disputeRef"
          caption={PROVIDER_OBJECT_COPY.removalDisputesTitle}
          emptyMessage={PROVIDER_OBJECT_COPY.noRemovalDisputes}
        />
      </div>
    </AeSection>
  )
}
