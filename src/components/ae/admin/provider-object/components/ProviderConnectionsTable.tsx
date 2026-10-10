import { AeSortableDataTable as SortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import type { AeDataColumn as DataColumn } from '@/components/ae/shared/sortable-data-table/sortable-data-table.contracts'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import '../../RecordWorkspaceComposition.css'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderConnectionRow,
  type ProviderConnectionsTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'
import { ProviderStatusBadge } from './ProviderStatusBadge'

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
    render: (_value, row) => <ProviderStatusBadge value={row.lifecycle} />,
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
        caption={PROVIDER_OBJECT_COPY.connectionsTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noConnections}
      />
    </section>
  )
}
