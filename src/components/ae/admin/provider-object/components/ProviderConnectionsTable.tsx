import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import '../../RecordWorkspaceComposition.css'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderConnectionRow,
  type ProviderConnectionsTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'

const columns: DataColumn<ProviderConnectionRow>[] = [
  {
    key: 'connectionRef',
    width: 240,
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.connection,
    render: (_value, row) => (
      <AeCopyReference label={PROVIDER_OBJECT_COPY.columns.connection} value={row.connectionRef} />
    ),
  },
  {
    key: 'lifecycle',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.lifecycle,
    render: (_value, row) => providerStatusLabel(row.lifecycle),
  },
  {
    key: 'sourceEnvironment',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.environment,
    render: (_value, row) => row.sourceEnvironment ?? providerStatusLabel('unavailable'),
  },
]

export function ProviderConnectionsTable({ rows }: ProviderConnectionsTableProps) {
  return (
    <section className="arc-market arc-admin-record-table-region" aria-label={PROVIDER_OBJECT_COPY.connectionsTitle}>
      <h2 className="arc-admin-record-table-heading">{PROVIDER_OBJECT_COPY.connectionsTitle}</h2>
      <SortableDataTable
        columns={columns}
        rows={[...rows]}
        rowKey="connectionRef"
        animateRows={false}
        caption={PROVIDER_OBJECT_COPY.connectionsTitle}
        ariaLabel={PROVIDER_OBJECT_COPY.connectionsTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noConnections}
      />
    </section>
  )
}
