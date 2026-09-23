import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderConnectionRow,
  type ProviderConnectionsTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'

const columns: ColumnDef<ProviderConnectionRow, unknown>[] = [
  {
    accessorKey: 'connectionRef',
    header: PROVIDER_OBJECT_COPY.columns.connection,
    cell: ({ row }) => (
      <AeCopyReference label={PROVIDER_OBJECT_COPY.columns.connection} value={row.original.connectionRef} />
    ),
  },
  {
    accessorKey: 'lifecycle',
    header: PROVIDER_OBJECT_COPY.columns.lifecycle,
    cell: ({ row }) => providerStatusLabel(row.original.lifecycle),
  },
  {
    accessorKey: 'sourceEnvironment',
    header: PROVIDER_OBJECT_COPY.columns.environment,
    cell: ({ row }) => row.original.sourceEnvironment ?? providerStatusLabel('unavailable'),
  },
]

export function ProviderConnectionsTable({ rows }: ProviderConnectionsTableProps) {
  return (
    <AeSection title={PROVIDER_OBJECT_COPY.connectionsTitle}>
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.connectionRef}
        hideFilter
        caption={PROVIDER_OBJECT_COPY.connectionsTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noConnections}
      />
    </AeSection>
  )
}
