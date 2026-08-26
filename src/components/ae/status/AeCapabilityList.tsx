'use client'

import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/ui/button'
import type { PublicBusinessCatalogApiV2Dto, PublicOfferingDto } from '@/modules/registry/public'

type AeCapabilityListProps = {
  catalog: PublicBusinessCatalogApiV2Dto
}

export function AeCapabilityList({ catalog }: AeCapabilityListProps) {
  const columns = useMemo<ColumnDef<PublicOfferingDto, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (item) => item.name,
        header: ({ column }) => <AeOperatorSortableHeader label="Operation" column={column} />,
        cell: ({ row }) => (
          <div className="grid min-w-[12rem] gap-0.5">
            <span className="font-medium">{row.original.name}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground">{row.original.summary}</span>
          </div>
        ),
      },
      {
        id: 'access',
        accessorFn: (item) => item.accessPaths.length,
        header: 'Access',
        cell: ({ row }) =>
          row.original.accessPaths.length === 0
            ? 'No access route'
            : `${row.original.accessPaths.length} ${row.original.accessPaths.length === 1 ? 'route' : 'routes'}`,
      },
    ],
    [],
  )

  if (catalog.offerings.length === 0) {
    return (
      <AeEmptyState
        title="No published Operations yet"
        description="Add an Operation so agents can inspect the tool and its price."
        action={
          <Button asChild className="min-h-11">
            <a href="/owner/offerings/new">Add Operation</a>
          </Button>
        }
      />
    )
  }

  return (
    <AeRecordTable
      columns={columns}
      data={catalog.offerings}
      caption="Published Operations"
      countLabel="Operations"
      filterPlaceholder="Filter Operations…"
      hideFilter={catalog.offerings.length <= 1}
      getRowHref={(item) => `/owner/offerings/${encodeURIComponent(item.offeringRef)}`}
    />
  )
}
