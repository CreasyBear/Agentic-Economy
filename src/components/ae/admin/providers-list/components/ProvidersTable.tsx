import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import type { ColumnDef } from '@tanstack/react-table'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import '../../RecordWorkspaceComposition.css'
import {
  PROVIDERS_LIST_COPY,
  type AdminProviderRowModel,
  type ProvidersTableProps,
} from '../providers-list.contracts'

const columns: ColumnDef<AeRecordTableFeatures, AdminProviderRowModel, unknown>[] = [
  {
    accessorKey: 'slug',
    header: PROVIDERS_LIST_COPY.columns.provider,
    cell: ({ row }) => (
      <a
        className="arc-admin-record-link"
        href={row.original.href}
      >
        {row.original.slug}
      </a>
    ),
  },
  {
    accessorKey: 'publicStatusLabel',
    header: PROVIDERS_LIST_COPY.columns.publicStatus,
    cell: ({ row }) => <Badge tone="neutral" size="sm">{row.original.publicStatusLabel}</Badge>,
  },
  {
    accessorKey: 'trustTierLabel',
    header: PROVIDERS_LIST_COPY.columns.trustTier,
  },
  {
    accessorKey: 'updatedAtLabel',
    header: PROVIDERS_LIST_COPY.columns.updated,
    cell: ({ row }) => (
      <time dateTime={row.original.updatedAtIso}>{row.original.updatedAtLabel}</time>
    ),
  },
]

export function ProvidersTable({ rows, filtered, paginationStatus, onLoadMore }: ProvidersTableProps) {
  return (
    <AeSection title={PROVIDERS_LIST_COPY.tableTitle} description={PROVIDERS_LIST_COPY.tableDescription}>
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.slug}
        hideFilter
        caption={PROVIDERS_LIST_COPY.tableTitle}
        emptyMessage={filtered ? PROVIDERS_LIST_COPY.noMatches : PROVIDERS_LIST_COPY.noRows}
      />
      {paginationStatus === 'CanLoadMore' ? (
        <Button type="button" variant="secondary" size="md" className="justify-self-start" onClick={onLoadMore}>
          {PROVIDERS_LIST_COPY.loadMore}
        </Button>
      ) : null}
    </AeSection>
  )
}
