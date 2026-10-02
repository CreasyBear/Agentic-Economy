import { groupDirectoryProviders, toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { ProductListing } from '@/components/arc/market/ProductListing'
import { ProviderListingCard } from '@/components/arc/market/ProviderListing'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import '@/components/arc/market/ProviderListing.css'

export type DirectoryProviderListProps = Readonly<{
  layout?: 'table' | 'grid'
  entries: readonly X402DirectoryEntry[]
  onSelect: (provider: string) => void
}>

type ProviderRow = { provider: string; count: number; model: ReturnType<typeof toDirectoryToolCardModel> }

/** The first observed Tool supplies price/activity; the host count is scoped to these results. */
export function DirectoryProviderList({ entries, layout = 'table', onSelect }: DirectoryProviderListProps) {
  const rows: ProviderRow[] = groupDirectoryProviders(entries).flatMap(group => {
    const lead = group.tools[0]
    return lead === undefined ? [] : [{ provider: group.provider, count: group.tools.length, model: toDirectoryToolCardModel(lead) }]
  })
  const countLabel = (row: ProviderRow) => `${row.count.toLocaleString('en-AU')} ${row.count === 1 ? 'Tool' : 'Tools'} in these results`
  const action = (provider: string) => <button type="button" className="arc-provider-table-action" onClick={() => onSelect(provider)} aria-label={`View Tools from ${provider}`}>{provider}</button>
  if (layout === 'grid') return <ProductListing>{rows.map(row => <li key={row.provider} className="h-full min-w-0"><ProviderListingCard provider={row.provider} {...(row.model.iconUrl === undefined ? {} : { iconUrl: row.model.iconUrl })} countLabel={countLabel(row)} countScope="Price and activity below belong to the shown Tool." action={action(row.provider)} facts={<div className="arc-provider-source-facts"><p>Shown Tool: {row.model.title}</p><p>{row.model.accessLabel}</p><p>{row.model.priceLabel || 'Price unavailable'}</p>{row.model.priceContext === '' ? null : <p>{row.model.priceContext}</p>}<p>Coinbase Bazaar calls · 30 days: {row.model.callsLabel ?? 'Not reported'}</p><p>Coinbase Bazaar payers · 30 days: {row.model.payersLabel ?? 'Not reported'}</p></div>} /></li>)}</ProductListing>
  const columns: DataColumn<ProviderRow>[] = [
    { key: 'provider', label: 'Provider', sortable: false, render: (_, { provider, model }) => <div className="arc-provider-table-identity"><span className="arc-provider-mark" aria-hidden="true">{model.initials}{model.iconUrl === undefined ? null : <img src={model.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</span><div><h3>{action(provider)}</h3><p className="arc-provider-table-caption">Shown Tool: {model.title}</p><p className="arc-provider-table-caption">{model.accessLabel}</p></div></div> },
    { key: 'price', label: 'Shown Tool price', sortable: false, numeric: true, render: (_, { model }) => <div className="arc-provider-table-numeric"><p>{model.priceLabel || 'Price unavailable'}</p>{model.priceContext === '' ? null : <p className="arc-provider-table-caption">{model.priceContext}</p>}</div> },
    { key: 'calls', label: 'Coinbase Bazaar calls · 30 days', sortable: false, numeric: true, render: (_, { model }) => <span {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}>{model.callsLabel ?? 'Not reported'}</span> },
    { key: 'payers', label: 'Coinbase Bazaar payers · 30 days', sortable: false, numeric: true, render: (_, { model }) => model.payersLabel ?? 'Not reported' },
    { key: 'count', label: 'Tools', sortable: false, numeric: true, render: (_, row) => <span title={countLabel(row)}>{row.count.toLocaleString('en-AU')}</span> },
  ]
  return <SortableDataTable rows={rows} columns={columns} rowKey="provider" ariaLabel="Providers" caption="Providers in these results. Price and Coinbase Bazaar activity belong to the shown Tool, not the whole host." animateRows={false} rowClassName="arc-listing-row" />
}
