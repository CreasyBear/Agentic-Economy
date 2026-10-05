import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
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
    render: (_value, row) => providerStatusLabel(row.state),
  },
  {
    key: 'updatedAt',
    sortable: false,
    label: PROVIDER_OBJECT_COPY.columns.updated,
    render: (_value, row) => {
      const updatedAt = providerTimestamp(row.updatedAt)
      return <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={updatedAt.iso}>{updatedAt.label}</time>
    },
  },
]

export function ProviderAdmissionCasesTable({ rows }: ProviderAdmissionCasesTableProps) {
  return (
    <AeSection title={PROVIDER_OBJECT_COPY.admissionCasesTitle}>
      <div className="ae-arc min-w-0">
        <SortableDataTable
          density="compact"
          columns={columns}
          rows={rows}
          rowKey="caseRef"
          caption={PROVIDER_OBJECT_COPY.admissionCasesTitle}
          emptyMessage={PROVIDER_OBJECT_COPY.noAdmissionCases}
        />
      </div>
    </AeSection>
  )
}
