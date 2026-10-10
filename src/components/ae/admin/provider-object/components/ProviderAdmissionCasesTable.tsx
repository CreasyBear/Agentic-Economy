import { AeSortableDataTable as SortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import type { AeDataColumn as DataColumn } from '@/components/ae/shared/sortable-data-table/sortable-data-table.contracts'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import '../../RecordWorkspaceComposition.css'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderAdmissionCaseRow,
  type ProviderAdmissionCasesTableProps,
} from '../provider-object.contracts'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import { ProviderStatusBadge } from './ProviderStatusBadge'

const columns: DataColumn<ProviderAdmissionCaseRow>[] = [
  {
    key: 'caseRef',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.admissionCase,
    render: (_value, row) => (
      <AeCopyReference compact label={PROVIDER_OBJECT_COPY.columns.admissionCase} value={row.caseRef} />
    ),
  },
  {
    key: 'state',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.state,
    render: (_value, row) => <ProviderStatusBadge value={row.state} />,
  },
  {
    key: 'updatedAt',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.updated,
    render: (_value, row) => <RecordTime at={row.updatedAt} />,
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
        caption={PROVIDER_OBJECT_COPY.admissionCasesTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noAdmissionCases}
      />
    </section>
  )
}
