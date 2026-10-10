import { Link } from '@tanstack/react-router'
import { Check, Heart } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { Avatar } from '@/components/arc/avatar/avatar'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { type AeStatus } from '@/lib/ui/status-presentation'
import { Button } from '@/components/arc/button/button'
import { Card } from '@/components/arc/card/card'
import { SortableDataTable, type DataColumn, type SortState } from '@/components/arc/sortable-data-table/sortable-data-table'
import { PUBLIC_SURFACE } from '@/content/brand-copy'
import { PRICE_UNAVAILABLE, toDirectoryToolCardModel, type DirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { minimumDirectoryUsdPrice } from '@/modules/market/x402-directory-index'
import { MARKET_LINK_STATE } from './market-return-context'
import './MarketComposition.css'

/** Directory readiness shown as the shared status badge, so the card, row and tool page read the same. */
const ACCESS_STATUS: Record<DirectoryToolCardModel['access'], AeStatus> ={ ae_callable: 'ready_now', setup_required: 'setup_required', unavailable: 'unavailable' }

/** Server orders a header can ask for. Keyword search ranks by relevance only, so it passes no handler. */
type ServerSort = 'price_asc'

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
  /** The URL sort, so the table's header shows the order the page was read in. */
  sort?: string | undefined
  onSortChange?: (sort: ServerSort) => void
}>

type ToolRow = {
  key: string
  item: SavedDirectoryTool
  model: DirectoryToolCardModel
  title: string
  price: number | undefined
  calls: number | undefined
}

function toRow(item: SavedDirectoryTool): ToolRow {
  const model = toDirectoryToolCardModel(item.entry)
  const usd = minimumDirectoryUsdPrice(item.entry)
  return { key: item.entry.resource, item, model, title: model.title, price: usd === undefined ? undefined : Number(usd), calls: item.entry.activity?.calls30d }
}

/** An AUD estimate is marked on the face, as Google Flights marks its fares; only a Quote is exact. */
function shownPrice(model: DirectoryToolCardModel) {
  return model.priceEstimateSource === undefined ? model.priceLabel : `est. ${model.priceLabel}`
}

function priceLine(model: DirectoryToolCardModel) {
  return model.priceLabel === '' ? PRICE_UNAVAILABLE : PUBLIC_SURFACE.pricePerCall(shownPrice(model))
}

/** Save controls are optional: a card on the landing has no saved list to write to. */
export type DirectoryToolCardControls = Pick<DirectoryToolListProps, 'onSave' | 'isSaved' | 'saveDisabled' | 'saveUnknown'>

function SaveButton({ row, onSave, isSaved, saveDisabled = false, saveUnknown = false, className }: DirectoryToolCardControls & { row: ToolRow; className?: string }) {
  const saved = isSaved(row.item)
  return <Button type="button" variant="ghost" size="sm" className={className} onClick={() => onSave(row.item)} disabled={saveDisabled}
    aria-label={saveUnknown ? `Saved status unavailable for ${row.title}` : `${saved ? 'Unsave' : 'Save'} ${row.title}`} {...(saveUnknown ? { title: 'Saved status unavailable' } : { 'aria-pressed': saved })}>
    <Heart size={18} strokeWidth={1.75} fill={saved && !saveUnknown ? 'currentColor' : 'none'} aria-hidden="true" />
  </Button>
}

/**
 * The one listing card, on the landing and in /market (Arc Card, as Airbnb and OpenRouter do it): the provider's
 * mark, the title, what it does, one usage line and one price line. The whole card is one link; the heart sits above it.
 */
function ToolCard({ row, controls }: Readonly<{ row: ToolRow; controls?: DirectoryToolCardControls | undefined }>) {
  const { model } = row
  return <div className="ae-tool-card">
    <Card
      title={row.title}
      {...(model.glance === undefined ? {} : { description: model.glance })}
      avatar={<Avatar name={model.providerLine} {...(model.iconUrl === undefined ? {} : { src: model.iconUrl })} size="sm" />}
      meta={<><span className="ae-tool-card-provider">{model.providerLine}</span>{model.factsLine === undefined ? null : <span className="ae-tool-card-facts" title={model.factsLine}>{model.factsLine}</span>}</>}
      action={<span className="ae-tool-card-price" {...(model.priceContext === '' ? {} : { title: model.priceContext })}>
        {model.priceLabel === '' ? <span>{PRICE_UNAVAILABLE}</span> : <><span>{shownPrice(model)}</span><span>{model.priceEstimateSource === undefined ? 'per call' : `${model.priceEstimateSource} per call`}</span></>}
      </span>}
    >
      {/* Every card states its readiness, as the table does: a missing badge would read as "probably fine". */}
      <div className="ae-tool-card-badge"><AeStatusBadge status={ACCESS_STATUS[model.access]} density="cell" /></div>
    </Card>
    <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="ae-tool-card-link"
      aria-label={`${row.title}, ${model.providerLine}, ${priceLine(model)}`} />
    {controls === undefined ? null : <SaveButton row={row} {...controls} className="ae-tool-card-save" />}
  </div>
}

/** One listing as a card, from a directory entry. */
export const DirectoryToolCard = memo(function DirectoryToolCard({ entry, controls }: Readonly<{ entry: X402DirectoryEntry; controls?: DirectoryToolCardControls | undefined }>) {
  const row = useMemo(() => toRow({ entry, search: {} }), [entry])
  return <ToolCard row={row} controls={controls} />
})

export const DirectoryToolList = memo(function DirectoryToolList({ items, layout = 'table', ...props }: DirectoryToolListProps) {
  const rows = useMemo(() => items.map(toRow), [items])
  if (layout === 'grid') {
    const controls = { onSave: props.onSave, isSaved: props.isSaved, saveDisabled: props.saveDisabled ?? false, saveUnknown: props.saveUnknown ?? false }
    return <ul className="arc-tool-grid">{rows.map(row => <li key={row.key}><ToolCard row={row} controls={controls} /></li>)}</ul>
  }
  return <DirectoryToolTable rows={rows} {...props} />
})

/**
 * The header orders the index can apply, each one way only. The default order (most buyers) has no column, so no header
 * claims it; calls are not a server order here, so that header does not sort a single page and call it the index.
 */
const HEADER_SORT: Readonly<Record<string, { sort: ServerSort; state: SortState }>> = { price: { sort: 'price_asc', state: { key: 'price', direction: 'asc' } } }

/**
 * Arc's sortable table, driven by the URL as Arc's notes describe for server sorting: defaultSort per read, remounted
 * when the order changes. The pressed header gets focus back and the order is announced after the remount.
 */
function DirectoryToolTable({ rows, onSave, isSaved, saveDisabled = false, saveUnknown = false, onCompare, isComparing, compareDisabled, sort, onSortChange }: Omit<DirectoryToolListProps, 'items' | 'layout'> & { rows: ToolRow[] }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const pressedKey = useRef<string | undefined>(undefined)
  const [repress, setRepress] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const tableKey = `${sort ?? 'default'}:${repress}`
  useEffect(() => {
    const key = pressedKey.current
    if (key === undefined) return
    pressedKey.current = undefined
    wrapper.current?.querySelector<HTMLElement>(`th[data-key="${CSS.escape(key)}"] button`)?.focus()
  }, [tableKey])
  const serverSorted = (key: string) => onSortChange !== undefined && HEADER_SORT[key] !== undefined
  const columns: DataColumn<ToolRow>[] = [
    {
      key: 'title', label: 'Tool', sortable: false,
      render: (_value, row) => <div className="ae-tool-row">
        <Avatar name={row.model.providerLine} {...(row.model.iconUrl === undefined ? {} : { src: row.model.iconUrl })} size="sm" />
        <div className="ae-tool-row-text">
          <Link to="/tools/$providerHost/$slug" params={{ providerHost: row.model.providerHost, slug: row.model.slug }} state={MARKET_LINK_STATE} title={row.title}>{row.title}</Link>
          <span title={row.model.providerLine}>{row.model.providerLine}</span>
        </div>
      </div>,
    },
    { key: 'access', label: 'Access', sortable: false, render: (_value, row) => <AeStatusBadge status={ACCESS_STATUS[row.model.access]} density="cell" /> },
    { key: 'price', label: 'Price per call', sortable: serverSorted('price'), numeric: true, render: (_value, row) => <span {...(row.model.priceContext === '' ? {} : { title: row.model.priceContext })}>{row.model.priceLabel === '' ? PRICE_UNAVAILABLE : shownPrice(row.model)}</span> },
    { key: 'calls', label: 'Calls in 30 days', sortable: false, numeric: true, render: (_value, row) => <span {...(row.model.activityTitle === undefined ? {} : { title: row.model.activityTitle })}>{row.model.callsLabel ?? 'Not reported'}</span> },
    {
      key: 'actions', label: 'Save or compare', sortable: false,
      render: (_value, row) => {
        const comparing = isComparing(row.key)
        return <div className="ae-tool-row-actions">
          <SaveButton row={row} onSave={onSave} isSaved={isSaved} saveDisabled={saveDisabled} saveUnknown={saveUnknown} />
          <Button type="button" variant="ghost" size="sm" onClick={() => onCompare(row.item)} disabled={compareDisabled(row.key)} aria-label={`${comparing ? 'Remove' : 'Add'} ${row.title} ${comparing ? 'from' : 'to'} comparison`} aria-pressed={comparing}>
            {comparing ? <><Check size={15} aria-hidden="true" />Added</> : 'Compare'}
          </Button>
        </div>
      },
    },
  ]
  const defaultSort = onSortChange === undefined ? undefined : Object.values(HEADER_SORT).find(header => header.sort === sort)?.state
  return <div className="ae-tool-table" ref={wrapper}>
    <SortableDataTable<ToolRow>
      key={tableKey}
      rows={rows}
      columns={columns}
      rowKey="key"
      caption="Tools on this page"
      itemName={{ one: 'tool', other: 'tools' }}
      {...(defaultSort === undefined ? {} : { defaultSort })}
      {...(onSortChange === undefined ? {} : { onSortChange: (next: SortState) => {
        const header = HEADER_SORT[next.key]
        if (header === undefined) return
        pressedKey.current = next.key
        setAnnouncement(`Sorted by ${columns.find(column => column.key === next.key)?.label ?? next.key}, ${header.state.direction === 'asc' ? 'ascending' : 'descending'}`)
        // A second press would reverse only this page in Arc; reset to the index order instead.
        if (header.sort === sort) setRepress(count => count + 1)
        else onSortChange(header.sort)
      } })}
    />
    <p role="status" className="sr-only">{announcement}</p>
  </div>
}
