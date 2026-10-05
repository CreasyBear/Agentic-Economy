import { AeSection } from '@/components/ae/layout/AeSection'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Badge } from '@/components/arc/badge/badge'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import {
  ADMIN_EXCEPTIONS_COPY,
  type AdminResolutionRowModel,
  type PurchaseResolutionTableProps,
} from '../exceptions.contracts'

const columns: DataColumn<AdminResolutionRowModel>[] = [
  {
    key: 'callRef',
    sortable: false,
    label: ADMIN_EXCEPTIONS_COPY.columnLabels.call,
    render: (_value, row) => (
      <AeCopyReference compact label="Call" value={row.callRef} href={row.href} />
    ),
  },
  {
    key: 'terminalStateLabel',
    sortable: false,
    label: ADMIN_EXCEPTIONS_COPY.columnLabels.terminalState,
    render: (_value, row) => <Badge tone="neutral">{row.terminalStateLabel}</Badge>,
  },
  {
    key: 'resolvedAtLabel',
    sortable: false,
    label: ADMIN_EXCEPTIONS_COPY.columnLabels.resolvedAt,
    render: (_value, row) => (
      <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={row.resolvedAtIso}>{row.resolvedAtLabel}</time>
    ),
  },
]

export function PurchaseResolutionTable({ rows }: PurchaseResolutionTableProps) {
  return (
    <AeSection
      title={ADMIN_EXCEPTIONS_COPY.resolutionsTitle}
      description={ADMIN_EXCEPTIONS_COPY.resolutionsDescription}
    >
      <div className="ae-arc min-w-0">
        <SortableDataTable
          density="compact"
          columns={columns}
          rows={rows}
          rowKey="callRef"
          caption={ADMIN_EXCEPTIONS_COPY.resolutionsTitle}
          emptyMessage={ADMIN_EXCEPTIONS_COPY.noRecentResolutions}
        />
      </div>
    </AeSection>
  )
}
