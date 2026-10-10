import { AdminInvestigationLink } from '../../exceptions/AdminInvestigationReturn'
import { AeSortableDataTable as SortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import type { AeDataColumn as DataColumn } from '@/components/ae/shared/sortable-data-table/sortable-data-table.contracts'

import { ProviderStatusBadge } from './ProviderStatusBadge'
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
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.toolVersion,
    render: (_value, row) => (
      <AdminInvestigationLink
        className="arc-admin-record-link"
        href={`/admin/tools/${encodeURIComponent(row.ref)}`}
      >
        <span className="block max-w-72 truncate font-mono" title={row.ref}>{row.ref}</span>
      </AdminInvestigationLink>
    ),
  },
  {
    key: 'revision',
    sortable: false,
    numeric: true,
    label: PROVIDER_OBJECT_COPY.columns.revision,
    render: (_value, row) => row.revision === null
      ? PROVIDER_OBJECT_COPY.columns.currentRevision
      : String(row.revision),
  },
  {
    key: 'disposition',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.disposition,
    render: (_value, row) => <ProviderStatusBadge value={row.disposition} />,
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
        caption={PROVIDER_OBJECT_COPY.toolVersionsTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noToolVersions}
      />
    </section>
  )
}
