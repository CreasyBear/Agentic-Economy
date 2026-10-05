import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/ui/button'
import {
  PROVIDERS_LIST_COPY,
  type AdminProviderRowModel,
  type ProvidersTableProps,
} from '../providers-list.contracts'

const columns: DataColumn<AdminProviderRowModel>[] = [
  {
    key: 'slug',
    sortable: false,
    label: PROVIDERS_LIST_COPY.columns.provider,
    render: (_value, row) => (
      <a
        className="block truncate font-medium underline-offset-4 hover:underline"
        title={row.slug}
        href={row.href}
      >
        {row.slug}
      </a>
    ),
  },
  {
    key: 'publicStatusLabel',
    sortable: false,
    label: PROVIDERS_LIST_COPY.columns.publicStatus,
    render: (_value, row) => <Badge tone="neutral">{row.publicStatusLabel}</Badge>,
  },
  {
    key: 'trustTierLabel',
    sortable: false,
    label: PROVIDERS_LIST_COPY.columns.trustTier,
  },
  {
    key: 'updatedAtLabel',
    sortable: false,
    label: PROVIDERS_LIST_COPY.columns.updated,
    render: (_value, row) => (
      <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={row.updatedAtIso}>{row.updatedAtLabel}</time>
    ),
  },
]

export function ProvidersTable({ rows, filtered, paginationStatus, onLoadMore }: ProvidersTableProps) {
  return (
    <AeSection title={PROVIDERS_LIST_COPY.tableTitle} description={PROVIDERS_LIST_COPY.tableDescription}>
      <div className="ae-arc min-w-0">
        <SortableDataTable
          density="compact"
          columns={columns}
          rows={rows}
          rowKey="slug"
          caption={PROVIDERS_LIST_COPY.tableTitle}
          emptyMessage={filtered ? PROVIDERS_LIST_COPY.noMatches : PROVIDERS_LIST_COPY.noRows}
        />
      </div>
      {paginationStatus === 'CanLoadMore' ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={onLoadMore}>
          {PROVIDERS_LIST_COPY.loadMore}
        </Button>
      ) : null}
    </AeSection>
  )
}
