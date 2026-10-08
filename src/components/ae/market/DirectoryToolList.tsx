import { Link } from '@tanstack/react-router'
import { Check, Heart } from 'lucide-react'
import { memo } from 'react'

import { ProductListing, ProductListingCard } from '@/components/ae/shared/arc-pro/market/ProductListing'
import { AeSortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import type { AeDataColumn } from '@/components/ae/shared/sortable-data-table/sortable-data-table.contracts'
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

/** Server ordering and cursor pages stay with the parent in both Arc presentations. */
export const DirectoryToolList = memo(function DirectoryToolList({ items, layout = 'table', onSave, isSaved, saveDisabled = false, saveUnknown = false, onCompare, isComparing, compareDisabled }: DirectoryToolListProps) {
  const rows = items.map(item => ({ resource: item.entry.resource, item, model: toDirectoryToolCardModel(item.entry) }))
  if (layout === 'grid') return <ProductListing>{rows.map(({ resource, item, model }) => <li key={resource} className="h-full min-w-0"><ProductListingCard model={model} entry={item.entry} onSave={() => onSave(item)} saved={isSaved(item)} saveDisabled={saveDisabled} saveUnknown={saveUnknown} onCompare={() => onCompare(item)} comparing={isComparing(resource)} compareDisabled={compareDisabled(resource)} /></li>)}</ProductListing>
  const columns: AeDataColumn<ToolRow>[] = [
    { key: 'tool', label: 'Tool', sortable: false, render: (_, { model }) => <div className="arc-listing-row-identity"><span className="arc-listing-mark">{model.initials}{model.iconUrl === undefined ? null : <img src={model.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</span><div><h3><Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} title={model.title}>{model.title}</Link></h3><p className="arc-listing-row-provider" title={model.providerLine}>{model.providerLine}</p></div></div> },
    { key: 'access', label: 'Access', sortable: false, render: (_, { model }) => <span className="arc-listing-row-access">{model.accessLabel}</span> },
    { key: 'price', label: 'Price', sortable: false, numeric: true, render: (_, { model }) => <div className="arc-listing-row-price"><p>{model.priceLabel || 'Price unavailable'}</p>{model.priceContext === '' ? null : <p title={model.priceContext}>{model.priceContext}</p>}</div> },
    { key: 'calls', label: 'Coinbase Bazaar calls · 30 days', sortable: false, numeric: true, render: (_, { model }) => <span {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}>{model.callsLabel ?? 'Not reported'}</span> },
    { key: 'actions', label: 'Actions', sortable: false, render: (_, { resource, item, model }) => {
      const comparing = isComparing(resource)
      const saved = isSaved(item)
      return <div className="arc-listing-row-actions"><Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="arc-listing-inspect arc-listing-row-inspect">Inspect Tool</Link><button type="button" className="arc-listing-icon-button" onClick={() => onSave(item)} disabled={saveDisabled} aria-label={saveUnknown ? `Saved status unavailable for ${model.title}` : `${saved ? 'Unsave' : 'Save'} ${model.title}`} {...(saveUnknown ? { title: 'Saved status unavailable' } : { 'aria-pressed': saved })}><Heart size={18} strokeWidth={1.75} fill={saved && !saveUnknown ? 'currentColor' : 'none'} aria-hidden="true" /></button><button type="button" className="arc-listing-compare" onClick={() => onCompare(item)} disabled={compareDisabled(resource)} aria-label={`${comparing ? 'Remove' : 'Add'} ${model.title} ${comparing ? 'from' : 'to'} comparison`} aria-pressed={comparing}>{comparing ? <Check size={15} aria-hidden="true" /> : null}Compare</button></div>
    } },
  ]
  return <AeSortableDataTable rows={rows} columns={columns} rowKey="resource" ariaLabel="Tools" caption="Tools on this catalogue page. Ordering covers the catalogue; row actions preserve each Tool identity." rowClassName="arc-listing-row" />
})
