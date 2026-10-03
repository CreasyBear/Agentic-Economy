import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import '../../RecordWorkspaceComposition.css'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderAdmissionCaseRow,
  type ProviderAdmissionCasesTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'
import { providerTimestamp } from '../provider-object.view-model'

const columns: DataColumn<ProviderAdmissionCaseRow>[] = [
  {
    key: 'caseRef',
    width: 240,
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.admissionCase,
    render: (_value, row) => (
      <AeCopyReference label={PROVIDER_OBJECT_COPY.columns.admissionCase} value={row.caseRef} />
    ),
  },
  {
    key: 'state',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.state,
    render: (_value, row) => providerStatusLabel(row.state),
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
]

export function ProviderAdmissionCasesTable({ rows }: ProviderAdmissionCasesTableProps) {
  return (
    <section className="arc-market arc-admin-record-table-region" aria-label={PROVIDER_OBJECT_COPY.admissionCasesTitle}>
      <h2 className="arc-admin-record-table-heading">{PROVIDER_OBJECT_COPY.admissionCasesTitle}</h2>
      <SortableDataTable
        columns={columns}
        rows={[...rows]}
        rowKey="caseRef"
        animateRows={false}
        caption={PROVIDER_OBJECT_COPY.admissionCasesTitle}
        ariaLabel={PROVIDER_OBJECT_COPY.admissionCasesTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noAdmissionCases}
      />
    </section>
  )
}
