import type { ColumnDef } from '@tanstack/react-table'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderPublicationRow,
  type ProviderToolVersionsTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'
import '../../RecordWorkspaceComposition.css'


const columns: ColumnDef<ProviderPublicationRow, unknown>[] = [
  {
    accessorKey: 'ref',
    header: PROVIDER_OBJECT_COPY.columns.toolVersion,
    cell: ({ row }) => (
      <a
        className="arc-admin-record-link"
        href={`/admin/tools/${encodeURIComponent(row.original.ref)}`}
      >
        {row.original.ref}
      </a>
    ),
  },
  {
    accessorKey: 'revision',
    header: PROVIDER_OBJECT_COPY.columns.revision,
    cell: ({ row }) => row.original.revision === null
      ? PROVIDER_OBJECT_COPY.columns.currentRevision
      : String(row.original.revision),
  },
  {
    accessorKey: 'disposition',
    header: PROVIDER_OBJECT_COPY.columns.disposition,
    cell: ({ row }) => <Badge variant="outline">{providerStatusLabel(row.original.disposition)}</Badge>,
  },
  {
    accessorKey: 'sourceAuthorityState',
    header: PROVIDER_OBJECT_COPY.columns.sourceAuthority,
    cell: ({ row }) => providerStatusLabel(row.original.sourceAuthorityState),
  },
]

export function ProviderToolVersionsTable({ rows }: ProviderToolVersionsTableProps) {
  return (
    <AeSection title={PROVIDER_OBJECT_COPY.toolVersionsTitle}>
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.ref}
        hideFilter
        caption={PROVIDER_OBJECT_COPY.toolVersionsTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noToolVersions}
      />
    </AeSection>
  )
}
