'use client'

import type { ColumnDef } from '@tanstack/react-table'

import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  ADMIN_CALL_OBJECT_COPY,
  type AdminCallActivityRow,
} from '../call-object.contracts'

export type AdminCallActivityProps = Readonly<{
  rows: readonly AdminCallActivityRow[]
}>

const columns: ColumnDef<AdminCallActivityRow>[] = [
  {
    accessorKey: 'at',
    header: ADMIN_CALL_OBJECT_COPY.occurredAtColumn,
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.at}</span>,
  },
  {
    accessorKey: 'eventType',
    header: ADMIN_CALL_OBJECT_COPY.eventTypeColumn,
    cell: ({ row }) => <code className="text-xs">{row.original.eventType}</code>,
  },
  {
    accessorKey: 'actorRef',
    header: ADMIN_CALL_OBJECT_COPY.actorColumn,
    cell: ({ row }) => <code className="break-all text-xs">{row.original.actorRef}</code>,
  },
  {
    accessorKey: 'outcome',
    header: ADMIN_CALL_OBJECT_COPY.outcomeColumn,
    cell: ({ row }) => <span>{row.original.outcome}</span>,
  },
]

export function AdminCallActivity({ rows }: AdminCallActivityProps) {
  return (
    <AeSection
      title={ADMIN_CALL_OBJECT_COPY.activityTitle}
      description={ADMIN_CALL_OBJECT_COPY.activityDescription}
    >
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption={ADMIN_CALL_OBJECT_COPY.activityTitle}
        emptyMessage={ADMIN_CALL_OBJECT_COPY.noActivity}
        hideFilter
      />
    </AeSection>
  )
}
