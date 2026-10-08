import { Link } from '@tanstack/react-router'
import { Check, Heart } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'

import { ProductListing, ProductListingCard } from '@/components/ae/shared/arc-pro/market/ProductListing'
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from '@/components/reui/data-grid/data-grid'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import { MARKET_LINK_STATE } from './market-return-context'

type DirectoryToolListProps = Readonly<{
  layout?: 'table' | 'grid'
  items: readonly SavedDirectoryTool[]
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (item: SavedDirectoryTool) => boolean
  saveDisabled?: boolean
  saveUnknown?: boolean
  onCompare: (item: SavedDirectoryTool) => void
  isComparing: (resource: string) => boolean
  compareDisabled: (resource: string) => boolean
}>

type ToolRow = { resource: string; item: SavedDirectoryTool; model: ReturnType<typeof toDirectoryToolCardModel> }

/** Table composition adapted from REUI c-data-grid-6:
 * https://reui.io/r/base-nova/c-data-grid-6.json
 * The parent owns catalogue ordering and cursor pages in both presentations.
 */
export const DirectoryToolList = memo(function DirectoryToolList({ items, layout = 'table', onSave, isSaved, saveDisabled = false, saveUnknown = false, onCompare, isComparing, compareDisabled }: DirectoryToolListProps) {
  const rows = useMemo(() => items.map(item => ({ resource: item.entry.resource, item, model: toDirectoryToolCardModel(item.entry) })), [items])
  if (layout === 'grid') return <ProductListing>{rows.map(({ resource, item, model }) => <li key={resource} className="h-full min-w-0"><ProductListingCard model={model} entry={item.entry} onSave={() => onSave(item)} saved={isSaved(item)} saveDisabled={saveDisabled} saveUnknown={saveUnknown} onCompare={() => onCompare(item)} comparing={isComparing(resource)} compareDisabled={compareDisabled(resource)} /></li>)}</ProductListing>
  return <DirectoryToolTable rows={rows} onSave={onSave} isSaved={isSaved} saveDisabled={saveDisabled} saveUnknown={saveUnknown} onCompare={onCompare} isComparing={isComparing} compareDisabled={compareDisabled} />
})

function DirectoryToolTable({ rows, onSave, isSaved, saveDisabled = false, saveUnknown = false, onCompare, isComparing, compareDisabled }: Omit<DirectoryToolListProps, 'items' | 'layout'> & { rows: ToolRow[] }) {
  const columns = useMemo<ColumnDef<DataGridFeatures, ToolRow>[]>(() => [
    {
      id: 'tool', header: 'Tool', enableSorting: false,
      cell: ({ row }) => {
        const { model } = row.original
        return <div className="flex min-w-56 max-w-sm items-center gap-2">
          <Avatar className="size-7" aria-hidden="true">
            {model.iconUrl === undefined ? null : <AvatarImage src={model.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <AvatarFallback>{model.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 whitespace-normal break-words">
            <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} title={model.title} className="text-foreground hover:text-primary inline-flex items-center font-medium [@media(pointer:coarse)]:min-h-touch">{model.title}</Link>
            <p className="text-muted-foreground text-xs" title={model.providerLine}>{model.providerLine}</p>
          </div>
        </div>
      },
    },
    {
      id: 'access', header: 'Access', enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.model.accessLabel}</span>,
    },
    {
      id: 'price', header: 'Price', enableSorting: false,
      meta: { numeric: true, headerClassName: 'text-end', cellClassName: 'text-end tabular-nums' },
      cell: ({ row }) => {
        const { model } = row.original
        return <div className="ms-auto min-w-40 max-w-64 whitespace-normal break-words">
          <p className="font-medium">{model.priceLabel || 'Price unavailable'}</p>
          {model.priceContext === '' ? null : <p className="text-muted-foreground text-xs" title={model.priceContext}>{model.priceContext}</p>}
        </div>
      },
    },
    {
      id: 'calls', header: 'Coinbase Bazaar calls · 30 days', enableSorting: false,
      meta: { numeric: true, headerClassName: 'text-end', cellClassName: 'text-end tabular-nums' },
      cell: ({ row }) => <span {...(row.original.model.activityTitle === undefined ? {} : { title: row.original.model.activityTitle })}>{row.original.model.callsLabel ?? 'Not reported'}</span>,
    },
    {
      id: 'actions', header: 'Actions', enableSorting: false,
      cell: ({ row }) => {
        const { resource, item, model } = row.original
        const comparing = isComparing(resource)
        const saved = isSaved(item)
        return <div className="flex items-center justify-end gap-2">
          <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="text-foreground hover:text-primary inline-flex min-h-11 items-center font-medium md:hidden">Inspect Tool</Link>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onSave(item)} disabled={saveDisabled} aria-label={saveUnknown ? `Saved status unavailable for ${model.title}` : `${saved ? 'Unsave' : 'Save'} ${model.title}`} {...(saveUnknown ? { title: 'Saved status unavailable' } : { 'aria-pressed': saved })}>
            <Heart size={18} strokeWidth={1.75} fill={saved && !saveUnknown ? 'currentColor' : 'none'} aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onCompare(item)} disabled={compareDisabled(resource)} aria-label={`${comparing ? 'Remove' : 'Add'} ${model.title} ${comparing ? 'from' : 'to'} comparison`} aria-pressed={comparing}>
            {comparing ? <Check size={15} aria-hidden="true" /> : null}Compare
          </Button>
        </div>
      },
    },
  ], [onSave, isSaved, saveDisabled, saveUnknown, onCompare, isComparing, compareDisabled])
  const table = useTable({
    features: dataGridFeatures, columns, data: rows,
    getRowId: row => row.resource,
    manualPagination: true, manualSorting: true, manualFiltering: true,
  })
  return <DataGrid table={table} recordCount={rows.length} tableLayout={{ width: 'auto', headerBackground: true }} tableClassNames={{ base: '[&_th]:border-border [&_td]:border-border' }} tableAriaLabel="Tools">
    <div className="w-full space-y-2.5">
      <DataGridContainer className="rounded-xl border border-border bg-card">
        <DataGridScrollArea>
          <DataGridTable caption="Tools on this catalogue page. Ordering covers the catalogue; row actions preserve each Tool identity." />
        </DataGridScrollArea>
      </DataGridContainer>
    </div>
  </DataGrid>
}
