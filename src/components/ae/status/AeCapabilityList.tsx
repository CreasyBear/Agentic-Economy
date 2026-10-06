'use client'

import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import type { PublicBusinessCatalogApiV2Dto, PublicListingDto } from '@/modules/registry/public'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

type AeCapabilityListProps = {
  catalog: PublicBusinessCatalogApiV2Dto
}

export function AeCapabilityList({ catalog }: AeCapabilityListProps) {
  const columns = useMemo<ColumnDef<PublicListingDto, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (item) => item.name,
        meta: { label: 'Tool', truncate: true },
        header: ({ column }) => <AeOperatorSortableHeader label="Tool" column={column} />,
        cell: ({ row }) => {
          const { name, summary } = row.original
          const fullText = summary.length === 0 ? name : `${name} · ${summary}`

          return (
            <span title={fullText}>
              <span className="font-medium">{name}</span>
              {summary.length === 0 ? null : (
                <span className="text-sm text-muted-foreground"> · {summary}</span>
              )}
            </span>
          )
        },
      },
      {
        id: 'access',
        accessorFn: (item) => item.accessPaths.length,
        meta: { label: 'Access' },
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
        title="No published Tools yet"
        description="Add a Tool so visitors can inspect its published facts and price."
        action={
          <a
            href="/owner/operations/new"
            className={['arc-market', actionLinkClassName('primary', 'md')].join(' ')}
          >
            Add Tool
          </a>
        }
      />
    )
  }

  // Requires supplied published records and stable offering references.
  // Ensures name/summary filtering and exact native record destinations.
  // Sorting/filtering never creates admission, access authority or a request.
  // Empty/no-match states retain the existing Add Tool and Clear filter actions.
  return (
    <AeRecordTable
      columns={columns}
      data={catalog.offerings}
      caption="Published Tools"
      countLabel="Tools"
      filterPlaceholder="Filter Tools…"
      hideFilter={catalog.offerings.length <= 1}
      globalFilterFn={(row, _columnId, query) => {
        const needle = String(query ?? '').trim().toLocaleLowerCase()
        return row.original.name.toLocaleLowerCase().includes(needle)
          || row.original.summary.toLocaleLowerCase().includes(needle)
      }}
      getRowId={(item) => item.offeringRef}
      rowAction={{
        kind: 'link',
        label: 'Open',
        getHref: (item) => `/owner/operations/${encodeURIComponent(item.offeringRef)}`,
        getAccessibleLabel: (item) => `Open ${item.name}`,
      }}
    />
  )
}
