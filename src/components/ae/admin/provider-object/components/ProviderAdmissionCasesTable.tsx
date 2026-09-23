import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  PROVIDER_OBJECT_COPY,
  type ProviderAdmissionCaseRow,
  type ProviderAdmissionCasesTableProps,
} from '../provider-object.contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'
import { providerTimestamp } from '../provider-object.view-model'

const columns: ColumnDef<ProviderAdmissionCaseRow, unknown>[] = [
  {
    accessorKey: 'caseRef',
    header: PROVIDER_OBJECT_COPY.columns.admissionCase,
    cell: ({ row }) => (
      <AeCopyReference label={PROVIDER_OBJECT_COPY.columns.admissionCase} value={row.original.caseRef} />
    ),
  },
  {
    accessorKey: 'state',
    header: PROVIDER_OBJECT_COPY.columns.state,
    cell: ({ row }) => providerStatusLabel(row.original.state),
  },
  {
    accessorKey: 'updatedAt',
    header: PROVIDER_OBJECT_COPY.columns.updated,
    cell: ({ row }) => {
      const updatedAt = providerTimestamp(row.original.updatedAt)
      return <time dateTime={updatedAt.iso}>{updatedAt.label}</time>
    },
  },
]

export function ProviderAdmissionCasesTable({ rows }: ProviderAdmissionCasesTableProps) {
  return (
    <AeSection title={PROVIDER_OBJECT_COPY.admissionCasesTitle}>
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.caseRef}
        hideFilter
        caption={PROVIDER_OBJECT_COPY.admissionCasesTitle}
        emptyMessage={PROVIDER_OBJECT_COPY.noAdmissionCases}
      />
    </AeSection>
  )
}
