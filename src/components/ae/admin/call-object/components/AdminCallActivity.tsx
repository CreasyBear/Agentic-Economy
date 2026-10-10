'use client'

import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'

import type { ColumnDef } from '@tanstack/react-table'

import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { AeSection } from '@/components/ae/layout/AeSection'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import {
  ADMIN_CALL_OBJECT_COPY,
  type AdminCallActivityRow,
} from '../call-object.contracts'

export type AdminCallActivityProps = Readonly<{
  rows: readonly AdminCallActivityRow[]
}>

const columns: ColumnDef<AeRecordTableFeatures, AdminCallActivityRow>[] = [
  {
    accessorKey: 'eventType',
    header: ADMIN_CALL_OBJECT_COPY.eventTypeColumn,
    meta: { truncate: true },
    cell: ({ row }) => <code className="text-sm">{row.original.eventType}</code>,
  },
  {
    accessorKey: 'outcome',
    header: ADMIN_CALL_OBJECT_COPY.outcomeColumn,
    meta: { truncate: true },
  },
  {
    accessorKey: 'actorRef',
    header: ADMIN_CALL_OBJECT_COPY.actorColumn,
    meta: { truncate: true },
    cell: ({ row }) => <code className="text-sm">{row.original.actorRef}</code>,
  },
  {
    accessorKey: 'at',
    header: ADMIN_CALL_OBJECT_COPY.occurredAtColumn,
    cell: ({ row }) => <RecordTime at={row.original.at} />,
  },
]

export function AdminCallActivity({ rows }: AdminCallActivityProps) {
  return (
    <AeSection
      title={ADMIN_CALL_OBJECT_COPY.activityTitle}
      description={ADMIN_CALL_OBJECT_COPY.activityDescription}
      className="min-w-0"
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
