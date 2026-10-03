import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'

import { Badge } from '@/components/ui/badge'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderPublicationRow,
  type ProviderToolVersionsTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'
import '../../RecordWorkspaceComposition.css'


const columns: DataColumn<ProviderPublicationRow>[] = [
  {
    key: 'ref',
    width: 240,
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.toolVersion,
    render: (_value, row) => (
      <a
        className="arc-admin-record-link"
        href={`/admin/tools/${encodeURIComponent(row.ref)}`}
      >
        {row.ref}
      </a>
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
    render: (_value, row) => <Badge variant="outline">{providerStatusLabel(row.disposition)}</Badge>,
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
    <section className="arc-market arc-admin-record-table-region" aria-label={PROVIDER_OBJECT_COPY.toolVersionsTitle}>
      <h2 className="arc-admin-record-table-heading">{PROVIDER_OBJECT_COPY.toolVersionsTitle}</h2>
      <SortableDataTable
        columns={columns}
        rows={[...rows]}
        rowKey="ref"
        animateRows={false}
        caption={PROVIDER_OBJECT_COPY.toolVersionsTitle}
        ariaLabel={PROVIDER_OBJECT_COPY.toolVersionsTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noToolVersions}
      />
    </section>
  )
}
