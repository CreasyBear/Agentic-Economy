import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  AUDIT_COPY,
  type AdminApprovalRowModel,
  type PendingApprovalsPanelProps,
} from '../audit.contracts'

const columns: ColumnDef<AdminApprovalRowModel, unknown>[] = [
  {
    accessorKey: 'proposalRef',
    header: AUDIT_COPY.columnLabels.proposal,
    cell: ({ row }) => (
      <AeCopyReference label={AUDIT_COPY.columnLabels.proposal} value={row.original.proposalRef} />
    ),
  },
  {
    accessorKey: 'actionLabel',
    header: AUDIT_COPY.columnLabels.action,
  },
  {
    accessorKey: 'proposerRef',
    header: AUDIT_COPY.columnLabels.proposer,
    cell: ({ row }) => (
      <AeCopyReference label={AUDIT_COPY.columnLabels.proposer} value={row.original.proposerRef} />
    ),
  },
  {
    accessorKey: 'createdAtLabel',
    header: AUDIT_COPY.columnLabels.created,
    cell: ({ row }) => (
      <time dateTime={row.original.createdAtIso}>{row.original.createdAtLabel}</time>
    ),
  },
  {
    accessorKey: 'expiresAtLabel',
    header: AUDIT_COPY.columnLabels.expires,
    cell: ({ row }) => (
      <time dateTime={row.original.expiresAtIso}>{row.original.expiresAtLabel}</time>
    ),
  },
]

export function PendingApprovalsPanel({ rows }: PendingApprovalsPanelProps) {
  return (
    <AeSection
      title={AUDIT_COPY.pendingApprovalsTitle}
      description={AUDIT_COPY.pendingApprovalsDescription}
    >
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.proposalRef}
        hideFilter
        caption={AUDIT_COPY.pendingApprovalsTitle}
        emptyMessage={AUDIT_COPY.noPendingApprovals}
      />
    </AeSection>
  )
}
