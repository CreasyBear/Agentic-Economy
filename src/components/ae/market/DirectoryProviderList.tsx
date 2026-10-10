import { formatCount } from '@/lib/ui/format-time'
import { useMemo } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { groupDirectoryProviders, toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { ProductListing } from '@/components/ae/shared/arc-pro/market/ProductListing'
import { ProviderListingCard } from '@/components/ae/shared/arc-pro/market/ProviderListing'
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from '@/components/reui/data-grid/data-grid'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import '@/components/ae/shared/arc-pro/market/ProviderListing.css'

export type DirectoryProviderListProps = Readonly<{
  layout?: 'table' | 'grid'
  entries: readonly X402DirectoryEntry[]
  onSelect: (provider: string) => void
}>

type ProviderRow = { provider: string; count: number; model: ReturnType<typeof toDirectoryToolCardModel> }

/** Table composition adapted from REUI c-data-grid-6:
 * https://reui.io/r/base-nova/c-data-grid-6.json
 * The first observed Tool supplies price/activity; the host count is scoped to these results.
 */
export function DirectoryProviderList({ entries, layout = 'table', onSelect }: DirectoryProviderListProps) {
  const rows = useMemo<ProviderRow[]>(() => groupDirectoryProviders(entries).flatMap(group => {
    const lead = group.tools[0]
    return lead === undefined ? [] : [{ provider: group.provider, count: group.tools.length, model: toDirectoryToolCardModel(lead) }]
  }), [entries])
  const countLabel = (row: ProviderRow) => `${formatCount(row.count)} ${row.count === 1 ? 'Tool' : 'Tools'} in these results`
  const action = (provider: string) => <button type="button" className="arc-provider-table-action" onClick={() => onSelect(provider)} aria-label={`View Tools from ${provider}`}>{provider}</button>
  if (layout === 'grid') return <ProductListing>{rows.map(row => <li key={row.provider} className="h-full min-w-0"><ProviderListingCard provider={row.provider} {...(row.model.iconUrl === undefined ? {} : { iconUrl: row.model.iconUrl })} countLabel={countLabel(row)} countScope="Price and activity below belong to the shown Tool." action={action(row.provider)} facts={<div className="arc-provider-source-facts"><p>Shown Tool: {row.model.title}</p><p>{row.model.accessLabel}</p><p>{row.model.priceLabel || 'Price unavailable'}</p>{row.model.priceContext === '' ? null : <p>{row.model.priceContext}</p>}<p>Coinbase Bazaar calls · 30 days: {row.model.callsLabel ?? 'Not reported'}</p><p>Coinbase Bazaar payers · 30 days: {row.model.payersLabel ?? 'Not reported'}</p></div>} /></li>)}</ProductListing>
  return <DirectoryProviderTable rows={rows} onSelect={onSelect} />
}

function DirectoryProviderTable({ rows, onSelect }: Pick<DirectoryProviderListProps, 'onSelect'> & { rows: ProviderRow[] }) {
  const columns = useMemo<ColumnDef<DataGridFeatures, ProviderRow>[]>(() => [
    {
      id: 'provider', header: 'Directory Host', enableSorting: false,
      cell: ({ row }) => {
        const { provider, model } = row.original
        return <div className="flex min-w-56 max-w-sm items-center gap-2">
          <Avatar className="size-7" aria-hidden="true">
            {model.iconUrl === undefined ? null : <AvatarImage src={model.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <AvatarFallback>{model.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 whitespace-normal break-words">
            <Button type="button" variant="link" size="sm" className="h-auto max-w-full justify-start px-0 text-start whitespace-normal break-words" onClick={() => onSelect(provider)} aria-label={`View Tools from ${provider}`}>{provider}</Button>
            <p className="text-muted-foreground text-xs">Shown Tool: {model.title}</p>
            <p className="text-muted-foreground text-xs">{model.accessLabel}</p>
          </div>
        </div>
      },
    },
    {
      id: 'price', header: 'Shown Tool price', enableSorting: false,
      meta: { numeric: true, headerClassName: 'text-end', cellClassName: 'text-end tabular-nums' },
      cell: ({ row }) => {
        const { model } = row.original
        return <div className="ms-auto min-w-40 max-w-64 whitespace-normal break-words">
          <p className="font-medium">{model.priceLabel || 'Price unavailable'}</p>
          {model.priceContext === '' ? null : <p className="text-muted-foreground text-xs">{model.priceContext}</p>}
        </div>
      },
    },
    {
      id: 'calls', header: 'Coinbase Bazaar calls · 30 days', enableSorting: false,
      meta: { numeric: true, headerClassName: 'text-end', cellClassName: 'text-end tabular-nums' },
      cell: ({ row }) => <span {...(row.original.model.activityTitle === undefined ? {} : { title: row.original.model.activityTitle })}>{row.original.model.callsLabel ?? 'Not reported'}</span>,
    },
    {
      id: 'payers', header: 'Coinbase Bazaar payers · 30 days', enableSorting: false,
      meta: { numeric: true, headerClassName: 'text-end', cellClassName: 'text-end tabular-nums' },
      cell: ({ row }) => row.original.model.payersLabel ?? 'Not reported',
    },
    {
      id: 'count', header: 'Tools', enableSorting: false,
      meta: { numeric: true, headerClassName: 'text-end', cellClassName: 'text-end tabular-nums' },
      cell: ({ row }) => <span title={`${formatCount(row.original.count)} ${row.original.count === 1 ? 'Tool' : 'Tools'} in these results`}>{formatCount(row.original.count)}</span>,
    },
  ], [onSelect])
  const table = useTable({
    features: dataGridFeatures, columns, data: rows,
    getRowId: row => row.provider,
    manualPagination: true, manualSorting: true, manualFiltering: true,
  })
  return <DataGrid table={table} recordCount={rows.length} tableLayout={{ width: 'auto', headerBackground: true }} tableClassNames={{ base: '[&_th]:border-border [&_td]:border-border' }} tableAriaLabel="Directory Hosts">
    <div className="w-full space-y-2.5">
      <DataGridContainer className="rounded-xl border border-border bg-card">
        <DataGridScrollArea>
          <DataGridTable caption="Directory Hosts in these results. Price and Coinbase Bazaar activity belong to the shown Tool, not the whole host." />
        </DataGridScrollArea>
      </DataGridContainer>
    </div>
  </DataGrid>
}
