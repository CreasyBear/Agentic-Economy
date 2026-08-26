import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'

export type AeOperatorStatusRow = {
  id: string
  label: string
  state: string
  description?: ReactNode
  meta?: ReactNode
}

export type AeOperatorStatusListProps = {
  rows: readonly AeOperatorStatusRow[]
  scroll?: boolean
  maxHeight?: string
}

export function AeOperatorStatusList({
  rows,
  scroll = false,
  maxHeight = 'min(24rem, 50vh)',
}: AeOperatorStatusListProps) {
  const columns = useMemo<ColumnDef<AeOperatorStatusRow, unknown>[]>(
    () => [
      {
        id: 'label',
        accessorKey: 'label',
        header: ({ column }) => <AeOperatorSortableHeader label="Item" column={column} />,
        cell: ({ row }) => (
          <div className="grid gap-0.5">
            <span className="font-medium">{row.original.label}</span>
            {row.original.description === undefined ? null : (
              <span className="text-xs text-muted-foreground">{row.original.description}</span>
            )}
          </div>
        ),
      },
      {
        id: 'state',
        accessorKey: 'state',
        header: ({ column }) => <AeOperatorSortableHeader label="State" column={column} />,
        cell: ({ row }) => <Badge variant="secondary">{row.original.state}</Badge>,
      },
      {
        id: 'meta',
        header: 'Detail',
        cell: ({ row }) => row.original.meta ?? <span className="text-muted-foreground">—</span>,
      },
    ],
    [],
  )

  if (rows.length === 0) {
    return (
      <AeEmptyState
        title="No statuses recorded"
        description="There are no status rows to display."
      />
    )
  }

  return (
    <AeRecordTable
      columns={columns}
      data={rows}
      caption="Statuses"
      hideFilter={rows.length <= 6}
      {...(scroll ? { maxHeight } : {})}
    />
  )
}
