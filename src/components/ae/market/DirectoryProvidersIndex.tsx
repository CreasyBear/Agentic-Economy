import { formatCount } from '@/lib/ui/format-time'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Card } from '@/components/arc/card/card'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import { toDirectoryProviderRow } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import type { MarketSearch } from '@/modules/market/market-route-data'
import { MARKET_LINK_STATE } from './market-return-context'
import { useMarketPath } from './market-navigation-context'

export type DirectoryProvidersIndexProps = Readonly<{ result: X402DirectoryProvidersPage; search?: MarketSearch }>

type HostRow = {
  key: string
  count: number
  example: string
  model: ReturnType<typeof toDirectoryProviderRow>
}

const toolCount = (count: number) => `${formatCount(count)} ${count === 1 ? 'tool' : 'tools'}`

/** Every provider in the host index with its whole-index tool count. Opening one shows the tools it lists. */
export function DirectoryProvidersIndex({ result, search = {} }: DirectoryProvidersIndexProps) {
  const marketPath = useMarketPath()
  const presentation = {
    ...(search.compare === undefined ? {} : { compare: search.compare }),
    ...(search.layout === undefined ? {} : { layout: search.layout }),
  }
  const firstPage = { ...presentation, view: 'providers' as const, ...(search.query === undefined ? {} : { query: search.query }) }
  const toolsFrom = (host: string) => ({ ...presentation, view: 'tools' as const, provider: host })
  if (result.kind === 'unavailable') return <EmptyState role="alert" titleAs="h2"
    title={result.reason === 'query_invalid' ? 'Check this provider search' : 'Providers didn’t load'}
    description={result.reason === 'query_invalid' ? 'Type the start of a provider’s web address, without https or a path.' : 'We couldn’t reach the provider list. Try again.'}
    action={result.reason === 'query_invalid'
      ? <Link to={marketPath} search={{ ...presentation, view: 'providers' }} className={actionLinkClassName('secondary', 'md')}>See all providers</Link>
      : <Link to={marketPath} reloadDocument search={{ ...firstPage, ...(search.providerCursor === undefined ? {} : { providerCursor: search.providerCursor }) }} className={actionLinkClassName('secondary', 'md')}>Try again</Link>} />
  const rows: HostRow[] = result.page.map(provider => {
    const model = toDirectoryProviderRow(provider)
    return { key: provider.key, count: provider.count, example: model.leadTitle ?? '', model }
  })
  const columns: DataColumn<HostRow>[] = [
    // Pages come from a cursor in host order, so no header offers a sort that would cover only this page.
    { key: 'key', label: 'Provider', sortable: false, render: (_value, row) => <div className="ae-tool-row">
      <Avatar name={row.key} {...(row.model.iconUrl === undefined ? {} : { src: row.model.iconUrl })} size="sm" />
      <div className="ae-tool-row-text"><Link to={marketPath} search={toolsFrom(row.key)} aria-label={`See tools from ${row.key}`} title={row.key}>{row.key}</Link></div>
    </div> },
    { key: 'example', label: 'Example tool', sortable: false, render: (_value, row) => row.model.leadTitle === undefined ? <span className="ae-muted">None reported</span>
      : row.model.leadSlug === undefined ? row.model.leadTitle
      : <Link to="/tools/$providerHost/$slug" params={{ providerHost: row.key, slug: row.model.leadSlug }} state={MARKET_LINK_STATE} title={row.model.leadTitle}>{row.model.leadTitle}</Link> },
    { key: 'count', label: 'Tools', sortable: false, numeric: true },
  ]
  return <section aria-label="Providers" className="ae-providers">
    {rows.length === 0
      ? <EmptyState titleAs="h2"
          title={!result.isDone ? 'Nothing on this page' : search.query === undefined ? 'No providers yet' : `No providers start with “${search.query}”`}
          description={!result.isDone ? 'More providers are on the next page.' : 'Try fewer letters, or clear the search to see every provider.'}
          {...(search.query === undefined ? {} : { action: <Link to={marketPath} search={{ ...presentation, view: 'providers' }} className={actionLinkClassName('secondary', 'md')}>See all providers</Link> })} />
      : search.layout === 'table'
        ? <div className="ae-tool-table"><SortableDataTable<HostRow> rows={rows} columns={columns} rowKey="key" caption="Providers" itemName={{ one: 'provider', other: 'providers' }} /></div>
        : <ul className="arc-tool-grid">{rows.map(row => <li key={row.key}><div className="ae-tool-card">
            <Card title={row.key}
              {...(row.model.leadTitle === undefined ? {} : { description: `Busiest tool: ${row.model.leadTitle}` })}
              avatar={<Avatar name={row.key} {...(row.model.iconUrl === undefined ? {} : { src: row.model.iconUrl })} size="sm" />}
              meta={<span className="ae-tool-card-provider">{toolCount(row.count)}</span>} />
            <Link to={marketPath} search={toolsFrom(row.key)} className="ae-tool-card-link" aria-label={`See ${toolCount(row.count)} from ${row.key}`} />
          </div></li>)}</ul>}
    {search.providerCursor === undefined && (result.isDone || result.continueCursor === '') ? null : <nav aria-label="Provider pages" className="ae-browse-pages">
      <span className="justify-self-start">{search.providerCursor === undefined ? null : <Link to={marketPath} search={firstPage} className={actionLinkClassName('secondary', 'md')}>First page</Link>}</span>
      <span />
      <span className="justify-self-end">{result.isDone || result.continueCursor === '' ? null : <Link to={marketPath} search={{ ...firstPage, providerCursor: result.continueCursor }} className={actionLinkClassName('secondary', 'md')}>Next<ArrowRightIcon aria-hidden="true" /></Link>}</span>
    </nav>}
  </section>
}
