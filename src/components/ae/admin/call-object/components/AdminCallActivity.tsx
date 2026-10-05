'use client'

import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  ADMIN_CALL_OBJECT_COPY,
  type AdminCallActivityRow,
} from '../call-object.contracts'

export type AdminCallActivityProps = Readonly<{
  rows: readonly AdminCallActivityRow[]
}>

const columns: DataColumn<AdminCallActivityRow>[] = [
  {
    key: 'at',
    sortable: false,
    label: ADMIN_CALL_OBJECT_COPY.occurredAtColumn,
    render: (_value, row) => <span className="whitespace-nowrap tabular-nums">{row.at}</span>,
  },
  {
    key: 'eventType',
    sortable: false,
    label: ADMIN_CALL_OBJECT_COPY.eventTypeColumn,
    render: (_value, row) => <code className="text-xs">{row.eventType}</code>,
  },
  {
    key: 'actorRef',
    sortable: false,
    label: ADMIN_CALL_OBJECT_COPY.actorColumn,
    render: (_value, row) => <AeCopyReference compact label="Actor" value={row.actorRef} />,
  },
  {
    key: 'outcome',
    sortable: false,
    label: ADMIN_CALL_OBJECT_COPY.outcomeColumn,
    render: (_value, row) => <span>{row.outcome}</span>,
  },
]

export function AdminCallActivity({ rows }: AdminCallActivityProps) {
  return (
    <AeSection
      title={ADMIN_CALL_OBJECT_COPY.activityTitle}
      description={ADMIN_CALL_OBJECT_COPY.activityDescription}
      className="min-w-0"
    >
      <div className="min-w-0 max-w-full overflow-x-auto">
        <div className="ae-arc min-w-0">
        <SortableDataTable
          density="compact"
            columns={columns}
            rows={rows}
            rowKey="id"
            caption={ADMIN_CALL_OBJECT_COPY.activityTitle}
            emptyMessage={ADMIN_CALL_OBJECT_COPY.noActivity}
            />
      </div>
      </div>
    </AeSection>
  )
}
