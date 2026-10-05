import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderConnectionRow,
  type ProviderConnectionsTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'

const columns: DataColumn<ProviderConnectionRow>[] = [
  {
    key: 'connectionRef',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.connection,
    render: (_value, row) => (
      <AeCopyReference compact label={PROVIDER_OBJECT_COPY.columns.connection} value={row.connectionRef} />
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
    <AeSection title={PROVIDER_OBJECT_COPY.connectionsTitle}>
      <div className="ae-arc min-w-0">
        <SortableDataTable
          density="compact"
          columns={columns}
          rows={rows}
          rowKey="connectionRef"
          caption={PROVIDER_OBJECT_COPY.connectionsTitle}
          emptyMessage={PROVIDER_OBJECT_COPY.noConnections}
        />
      </div>
    </AeSection>
  )
}
