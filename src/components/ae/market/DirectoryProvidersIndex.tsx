import { Link } from '@tanstack/react-router'
import { ArrowRight, StoreIcon } from 'lucide-react'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { toDirectoryProviderRow } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import '@/components/arc/market/ProductListing.css'
import '@/components/arc/market/ProviderListing.css'
import { MARKET_LINK_STATE } from './market-return-context'
import { useMarketPath } from './market-navigation-context'

export type DirectoryProvidersIndexProps = Readonly<{ result: X402DirectoryProvidersPage }>

/** Complete indexed counts stay distinct from the busiest Tool's price and activity. */
export function DirectoryProvidersIndex({ result }: DirectoryProvidersIndexProps) {
  const marketPath = useMarketPath()
  if (result.kind === 'unavailable') {
    return <section className="arc-market arc-provider-index" aria-label="Provider catalogue"><header className="arc-provider-index-heading"><h2>Explore Providers</h2></header><AeEmptyState icon={<StoreIcon />} title="Provider catalogue temporarily unavailable" description="The discovery service could not be reached. Try again." action={<><Link to={marketPath} reloadDocument search={{ view: 'providers' }} className="arc-listing-all">Try again</Link><Link to={marketPath} search={{ view: 'tools' }} className="arc-listing-all">Browse Tools</Link></>} /></section>
  }
  const ranked = result.page.some(provider => provider.leadCalls !== undefined && provider.leadCalls >= 0)
  return <section aria-label="Provider catalogue" className="arc-market arc-provider-index">
    <header className="arc-provider-index-heading"><h2>Providers</h2><p>{ranked ? 'Sorted by the busiest Tool. Calls, payers, and price belong to that Tool. The count is the whole host.' : 'Open a host to see the Tools they list. Counts cover the whole indexed catalogue.'}</p></header>
    {result.page.length === 0 ? <p role="status" className="arc-provider-index-empty">No Providers on this page.</p> : <div className="arc-listing-table-wrap"><table aria-label="Providers" className="arc-listing-table arc-provider-table">
      <caption className="sr-only">Indexed Providers. Tool counts cover the whole host. Price, calls and payers describe the busiest Tool over 30 days, reported by Coinbase Bazaar.</caption>
      <thead><tr><th scope="col">Provider</th>{ranked ? <th scope="col">Price</th> : null}{ranked ? <th scope="col">Calls</th> : null}{ranked ? <th scope="col">Payers</th> : null}<th scope="col">Tools</th></tr></thead>
      <tbody>{result.page.map(provider => {
        const model = toDirectoryProviderRow(provider)
        return <tr key={model.key} className="arc-listing-row"><td><div className="arc-provider-table-identity"><span className="arc-provider-mark" aria-hidden="true">{model.initials}{model.iconUrl === undefined ? null : <img src={model.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</span><div><h3><Link to={marketPath} search={{ view: 'tools', provider: model.key }} aria-label={`View Tools from ${model.key}`} className="arc-provider-table-action">{model.key}</Link></h3>{model.leadTitle === undefined ? null : model.leadSlug === undefined ? <p className="arc-provider-table-caption">{model.leadTitle}</p> : <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.key, slug: model.leadSlug }} state={MARKET_LINK_STATE} className="arc-provider-lead">{model.leadTitle}</Link>}</div></div></td>
          {ranked ? <td data-label="Busiest Tool price" className="arc-provider-table-numeric"><p>{model.priceLabel || 'Price unavailable'}</p>{model.priceSourceLabel === undefined ? null : <p className="arc-provider-table-caption">{model.priceSourceLabel}</p>}</td> : null}
          {ranked ? <td data-label="Busiest Tool calls · 30 days" className="arc-provider-table-numeric" title="Busiest Tool on this host, last 30 days. Coinbase Bazaar.">{model.callsLabel === '—' ? 'Not reported' : model.callsLabel}</td> : null}
          {ranked ? <td data-label="Busiest Tool payers · 30 days" className="arc-provider-table-numeric">{model.payersLabel === '—' ? 'Not reported' : model.payersLabel}</td> : null}
          <td data-label="Tools in the indexed catalogue" className="arc-provider-table-numeric" title={`${model.toolLabel} ${provider.count === 1 ? 'Tool' : 'Tools'} in the indexed catalogue`}>{model.toolLabel}</td>
        </tr>
      })}</tbody>
    </table></div>}
    <nav aria-label="Provider catalogue pages" className="arc-provider-pagination"><Link to={marketPath} search={{ view: 'providers' }}>First page</Link>{!result.isDone && <Link to={marketPath} search={{ view: 'providers', providerCursor: result.continueCursor }}>Next Providers<ArrowRight size={16} aria-hidden="true" /></Link>}</nav>
  </section>
}
