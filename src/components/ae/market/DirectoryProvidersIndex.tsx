import { formatCount } from '@/lib/ui/format-time'
import { Link } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { ArrowRight, StoreIcon } from 'lucide-react'
import { AeEmptyState } from '@/components/ae/shared/empty-state/AeEmptyState'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import { ProductListing } from '@/components/ae/shared/arc-pro/market/ProductListing'
import { toDirectoryProviderRow } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryFacet, X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import type { MarketSearch } from '@/modules/market/market-route-data'
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from '@/components/reui/data-grid/data-grid'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import '@/components/ae/shared/arc-pro/market/ProviderListing.css'
import { MARKET_LINK_STATE } from './market-return-context'
import { useMarketPath } from './market-navigation-context'

export type DirectoryProvidersIndexProps = Readonly<{ result: X402DirectoryProvidersPage; search?: MarketSearch }>

type HostRow = Readonly<{ key: string; provider: X402DirectoryFacet; model: ReturnType<typeof toDirectoryProviderRow> }>

/** Host identity and whole-index listing counts; no price or activity is a host-wide fact. */
export function DirectoryProvidersIndex({ result, search = {} }: DirectoryProvidersIndexProps) {
  const marketPath = useMarketPath()
  const presentation = {
    ...(search.compare === undefined ? {} : { compare: search.compare }),
    ...(search.layout === undefined ? {} : { layout: search.layout }),
  }
  const firstPage = { ...presentation, view: 'providers' as const, ...(search.query === undefined ? {} : { query: search.query }) }
  if (result.kind === 'unavailable') return <AeEmptyState icon={<StoreIcon />}
    title={result.reason === 'query_invalid' ? 'Check this Host search' : 'Directory Hosts temporarily unavailable'}
    description={result.reason === 'query_invalid' ? 'Use a hostname prefix without a URL or path. If the page reference has expired, start from the first page.' : 'The directory index could not be reached. Try again with the same hostname prefix.'}
    action={<>
      {result.reason === 'query_invalid' ? <Link to={marketPath} search={search.providerCursor === undefined ? { ...presentation, view: 'providers' } : firstPage} className={actionLinkClassName('secondary', 'md')}>{search.providerCursor === undefined ? 'Clear prefix' : 'Refresh Hosts'}</Link>
        : <Link to={marketPath} reloadDocument search={{ ...firstPage, ...(search.providerCursor === undefined ? {} : { providerCursor: search.providerCursor }) }} className={actionLinkClassName('secondary', 'md')}>Try again</Link>}
      {result.reason !== 'query_invalid' && search.providerCursor !== undefined ? <Link to={marketPath} search={firstPage} className={actionLinkClassName('ghost', 'md')}>First page</Link> : null}
      <Link to={marketPath} search={{ ...presentation, view: 'tools' }} className={actionLinkClassName('ghost', 'md')}>Browse Tools</Link>
    </>} />
  const rows = result.page.map(provider => ({ key: provider.key, provider, model: toDirectoryProviderRow(provider) }))
  const hostLink = ({ model }: HostRow) => <Link to={marketPath} search={{ ...presentation, view: 'tools', provider: model.key }} aria-label={`View Tools from ${model.key}`} className="break-words font-medium text-foreground hover:underline underline-offset-4">{model.key}</Link>
  const example = ({ model }: HostRow) => model.leadTitle === undefined ? <span className="text-muted-foreground">Example unavailable</span> : model.leadSlug === undefined ? <span>{model.leadTitle}</span> : <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.key, slug: model.leadSlug }} state={MARKET_LINK_STATE} className="break-words hover:underline underline-offset-4">{model.leadTitle}</Link>
  return <section aria-label="Directory Host results" className="min-w-0 space-y-6">
    {rows.length === 0 ? <AeEmptyState icon={<StoreIcon />} title={result.isDone ? search.providerCursor !== undefined ? 'No more Hosts on this page' : search.query === undefined ? 'No directory Hosts indexed' : 'No hostname matches this prefix' : 'More directory Hosts remain'} description={result.isDone ? 'Try a shorter hostname prefix or clear it to browse all Hosts.' : 'This page has no Hosts. Continue to the next page to check the remaining index.'} /> : search.layout === 'table'
      ? <DirectoryHostsTable rows={rows} hostLink={hostLink} example={example} />
      : <ProductListing>{rows.map(row => <li key={row.key} className="min-w-0 h-full"><article className="flex h-full min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3"><span className="arc-provider-mark" aria-hidden="true">{row.model.initials}</span><div className="min-w-0 flex-1"><h3 className="text-lg leading-snug [overflow-wrap:anywhere]">{hostLink(row)}</h3><p className="mt-1 text-xs text-muted-foreground">Directory Host</p></div></div>
        <p className="text-sm"><span className="font-medium tabular-nums">{formatCount(row.provider.count)}</span> {row.provider.count === 1 ? 'listing' : 'listings'} in the indexed catalogue</p>
        <div className="min-w-0 border-t border-border pt-4"><p className="mb-1 text-xs text-muted-foreground">Example Tool</p><p className="text-sm [overflow-wrap:anywhere]">{example(row)}</p></div>
        <Link to={marketPath} search={{ ...presentation, view: 'tools', provider: row.model.key }} className={`${actionLinkClassName('secondary', 'md')} mt-auto w-full justify-between`}>Browse this Host’s Tools<ArrowRight size={16} aria-hidden="true" /></Link>
      </article></li>)}</ProductListing>}
    <nav aria-label="Directory Host pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      {search.providerCursor === undefined ? <span /> : <Link to={marketPath} search={firstPage} className={actionLinkClassName('secondary', 'md')}>First page</Link>}
      <span className="text-sm text-muted-foreground">{formatCount(rows.length)} {rows.length === 1 ? 'Host' : 'Hosts'} on this page</span>
      {result.isDone || result.continueCursor === '' ? <span /> : <Link to={marketPath} search={{ ...firstPage, providerCursor: result.continueCursor }} className={actionLinkClassName('secondary', 'md')}>Next Hosts<ArrowRight size={16} aria-hidden="true" /></Link>}
    </nav>
  </section>
}

/** Table composition adapted from REUI c-data-grid-6:
 * https://reui.io/r/base-nova/c-data-grid-6.json
 * Host order and opaque cursor navigation remain with DirectoryProvidersIndex.
 */
function DirectoryHostsTable({ rows, hostLink, example }: Readonly<{
  rows: HostRow[]
  hostLink: (row: HostRow) => ReactNode
  example: (row: HostRow) => ReactNode
}>) {
  const columns = useMemo<ColumnDef<DataGridFeatures, HostRow>[]>(() => [
    {
      id: 'key', header: 'Directory Host', enableSorting: false,
      cell: ({ row }) => <div className="min-w-56 max-w-sm whitespace-normal [overflow-wrap:anywhere]">{hostLink(row.original)}</div>,
    },
    {
      id: 'provider', header: 'Indexed listings', enableSorting: false,
      meta: { numeric: true, headerClassName: 'text-end', cellClassName: 'text-end tabular-nums' },
      cell: ({ row }) => formatCount(row.original.provider.count),
    },
    {
      id: 'model', header: 'Example Tool', enableSorting: false,
      cell: ({ row }) => <div className="min-w-48 max-w-md whitespace-normal [overflow-wrap:anywhere]">{example(row.original)}</div>,
    },
  ], [hostLink, example])
  const table = useTable({
    features: dataGridFeatures, columns, data: rows,
    getRowId: row => row.key,
    manualPagination: true, manualSorting: true, manualFiltering: true,
  })
  return <DataGrid table={table} recordCount={rows.length} tableLayout={{ width: 'auto', headerBackground: true }} tableClassNames={{ base: '[&_th]:border-border [&_td]:border-border' }} tableAriaLabel="Directory Hosts">
    <div className="w-full space-y-2.5">
      <DataGridContainer className="rounded-xl border border-border bg-card">
        <DataGridScrollArea>
          <DataGridTable caption="Directory Hosts and their listing counts across the indexed generation. An example Tool is separate from the whole Host." />
        </DataGridScrollArea>
      </DataGridContainer>
    </div>
  </DataGrid>
}
