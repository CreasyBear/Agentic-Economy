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
        header: ({ column }) => <AeOperatorSortableHeader label="Offering" column={column} />,
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
          row.original.accessPaths.length === 0 ? (
            'No access route'
          ) : (
            <span className="font-mono tabular-nums">
              {row.original.accessPaths.length}{' '}
              {row.original.accessPaths.length === 1 ? 'route' : 'routes'}
            </span>
          ),
      },
    ],
    [],
  )

  if (catalog.offerings.length === 0) {
    return (
      <AeEmptyState
        title="No published offerings yet"
        description="Add a service offering so visitors can inspect its published facts and price."
        action={
          <Button asChild className="min-h-touch">
            <a href="/owner/offerings/new">Add service</a>
          </Button>
        }
      />
    )
  }

  return (
    <AeRecordTable
      columns={columns}
      data={catalog.offerings}
      caption="Published offerings"
      countLabel="Offerings"
      filterPlaceholder="Filter offerings…"
      hideFilter={catalog.offerings.length <= 1}
      getRowId={(item) => item.offeringRef}
      rowAction={{
        kind: 'link',
        label: 'Open',
        getHref: (item) => `/owner/supply/${encodeURIComponent(item.offeringRef)}`,
        getAccessibleLabel: (item) => `Open ${item.name}`,
      }}
    />
  )
}
