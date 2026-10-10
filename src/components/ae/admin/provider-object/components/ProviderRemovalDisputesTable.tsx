import { AeSortableDataTable as SortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import type { AeDataColumn as DataColumn } from '@/components/ae/shared/sortable-data-table/sortable-data-table.contracts'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import '../../RecordWorkspaceComposition.css'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderRemovalDisputeRow,
  type ProviderRemovalDisputesTableProps,
} from '../provider-object.contracts'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import { ProviderStatusBadge } from './ProviderStatusBadge'
import { ProviderDisputeAction } from './ProviderDisputeAction'

function disputeColumns(onCloseDispute?: ProviderRemovalDisputesTableProps['onCloseDispute']): DataColumn<ProviderRemovalDisputeRow>[] { return [
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
    render: (_value, row) => <ProviderStatusBadge value={row.status} />,
  },
  {
    key: 'updatedAt',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.updated,
    render: (_value, row) => <RecordTime at={row.updatedAt} />,
  },
  {
    key: 'actions',
    sortable: false,
    label: 'Action',
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
        caption={PROVIDER_OBJECT_COPY.removalDisputesTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noRemovalDisputes}
      />
    </section>
  )
}
