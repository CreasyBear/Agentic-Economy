import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Badge } from '@/components/arc/badge/badge'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderPublicationRow,
  type ProviderToolVersionsTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'


const columns: DataColumn<ProviderPublicationRow>[] = [
  {
    key: 'ref',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.toolVersion,
    render: (_value, row) => (
      <AeCopyReference compact label="Tool version" value={row.ref} href={`/admin/tools/${encodeURIComponent(row.ref)}`} />
    ),
  },
  {
    key: 'revision',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.revision,
    render: (_value, row) => row.revision === null
      ? PROVIDER_OBJECT_COPY.columns.currentRevision
      : String(row.revision),
  },
  {
    key: 'disposition',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.disposition,
    render: (_value, row) => <Badge tone="neutral">{providerStatusLabel(row.disposition)}</Badge>,
  },
  {
    key: 'sourceAuthorityState',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.sourceAuthority,
    render: (_value, row) => providerStatusLabel(row.sourceAuthorityState),
  },
]

export function ProviderToolVersionsTable({ rows }: ProviderToolVersionsTableProps) {
  return (
    <AeSection title={PROVIDER_OBJECT_COPY.toolVersionsTitle}>
      <div className="ae-arc min-w-0">
        <SortableDataTable
          density="compact"
          columns={columns}
          rows={rows}
          rowKey="ref"
          caption={PROVIDER_OBJECT_COPY.toolVersionsTitle}
          emptyMessage={PROVIDER_OBJECT_COPY.noToolVersions}
        />
      </div>
    </AeSection>
  )
}
