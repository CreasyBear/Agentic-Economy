import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import '../../RecordWorkspaceComposition.css'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderRemovalDisputeRow,
  type ProviderRemovalDisputesTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'
import { providerTimestamp } from '../provider-object.view-model'
import { ProviderDisputeAction } from './ProviderDisputeAction'

function disputeColumns(onCloseDispute?: ProviderRemovalDisputesTableProps['onCloseDispute']): DataColumn<ProviderRemovalDisputeRow>[] { return [
  {
    key: 'disputeRef',
    width: 240,
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.removalDispute,
    render: (_value, row) => (
      <AeCopyReference label={PROVIDER_OBJECT_COPY.columns.removalDispute} value={row.disputeRef} />
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
    width: 180,
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.updated,
    render: (_value, row) => {
      const updatedAt = providerTimestamp(row.updatedAt)
      return <time dateTime={updatedAt.iso} style={{ whiteSpace: 'nowrap' }}>{updatedAt.label}</time>
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
    <section className="arc-market arc-admin-record-table-region" aria-label={PROVIDER_OBJECT_COPY.removalDisputesTitle}>
      <h2 className="arc-admin-record-table-heading">{PROVIDER_OBJECT_COPY.removalDisputesTitle}</h2>
      <SortableDataTable
        columns={disputeColumns(onCloseDispute)}
        rows={[...rows]}
        rowKey="disputeRef"
        animateRows={false}
        caption={PROVIDER_OBJECT_COPY.removalDisputesTitle}
        ariaLabel={PROVIDER_OBJECT_COPY.removalDisputesTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noRemovalDisputes}
      />
    </section>
  )
}
