import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { CompassIcon, HeartIcon, ListFilterIcon, SearchIcon, StoreIcon } from 'lucide-react'
import { Button } from '@/components/arc/button/button'
import { SearchField } from '@/components/arc/search-field/search-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ae/shared/router-tabs/RouterTabs'
import { ProductListingHeader } from '@/components/ae/shared/arc-pro/market/ProductListing'
import type { MarketSearch } from '@/modules/market/market-route-data'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import { DirectoryProvidersIndex } from './DirectoryProvidersIndex'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'

export type DirectoryHostsPageProps = Readonly<{ result: X402DirectoryProvidersPage; search: MarketSearch }>

/** URL-owned, indexed hostname-prefix discovery. Loaded rows are never locally filtered. */
export function DirectoryHostsPage({ result, search }: DirectoryHostsPageProps) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(search.query ?? '')
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { setDraft(search.query ?? ''); setError(undefined) }, [search.query])
  const presentation = {
    ...(search.compare === undefined ? {} : { compare: search.compare }),
    layout: search.layout ?? 'grid',
  }
  const hosts = { ...presentation, view: 'providers' as const, ...(search.query === undefined ? {} : { query: search.query }), ...(search.providerCursor === undefined ? {} : { providerCursor: search.providerCursor }) }
  return <div className="arc-market ae-market-hosts ae-rail pb-page">
    <ProductListingHeader title="Directory Hosts" headingLevel={1} description="Find the hostname behind a published Tool, then explore what it lists.">
      <form aria-label="Find a directory Host" className="arc-market-search-form" onSubmit={event => {
        event.preventDefault()
        const prefix = draft.trim().toLowerCase()
        if (prefix.length > SEARCH_QUERY_MAX_LENGTH || (prefix !== '' && !/^[a-z0-9][a-z0-9.-]*$/u.test(prefix))) {
          setError(`Enter a hostname prefix of ${SEARCH_QUERY_MAX_LENGTH} characters or fewer, without a URL, spaces or path.`)
          input.current?.focus()
          return
        }
        setError(undefined)
        void navigate({ to: '/market', search: { ...presentation, view: 'providers', ...(prefix === '' ? {} : { query: prefix }) }, resetScroll: false })
      }}>
        <SearchField ref={input} label="Find a directory Host" placeholder="Hostname starts with…" value={draft} onValueChange={value => { setDraft(value); setError(undefined) }} enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={error !== undefined} aria-describedby={error === undefined ? 'host-prefix-help' : 'host-prefix-help host-prefix-error'} />
        <Button type="submit" variant="primary">Find Host<SearchIcon aria-hidden="true" /></Button>
      </form>
    </ProductListingHeader>
    <p id="host-prefix-help" className="arc-market-search-hint">Search the full indexed Host list by the start of its hostname, such as api. Counts cover eligible listings on each Host; they do not imply callable AE Tools or a verified Provider.</p>
    {error === undefined ? null : <p role="alert" id="host-prefix-error" className="mt-2 text-sm text-destructive">{error}</p>}
    <Tabs value="providers" animateContent={false}>
      <TabsList aria-label="Browse the marketplace" className="arc-market-tabs">
        <TabsTrigger value="discover" nativeButton={false} render={<Link to="/market" search={{ ...presentation, view: 'discover' }} resetScroll={false} viewTransition={false} preload="intent" />}><CompassIcon aria-hidden="true" />Explore</TabsTrigger>
        <TabsTrigger value="tools" nativeButton={false} render={<Link to="/market" search={{ ...presentation, view: 'tools' }} resetScroll={false} viewTransition={false} preload="intent" />}><ListFilterIcon aria-hidden="true" />Tools</TabsTrigger>
        <TabsTrigger value="providers" nativeButton={false} render={<Link to="/market" search={hosts} resetScroll={false} viewTransition={false} preload="intent" />}><StoreIcon aria-hidden="true" />Directory Hosts</TabsTrigger>
        <TabsTrigger value="saved" nativeButton={false} render={<Link to="/market" search={{ ...presentation, view: 'saved' }} resetScroll={false} viewTransition={false} preload="intent" />}><HeartIcon aria-hidden="true" />Saved</TabsTrigger>
      </TabsList>
      <TabsContent value="providers" className="pt-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-title font-medium tracking-tight">{search.query === undefined ? 'Explore directory Hosts' : `Hostnames starting with “${search.query}”`}</h2><p className="mt-1 text-sm text-muted-foreground">{search.query === undefined ? 'Browse the indexed directory. Open a Host to see its published listings.' : 'Hostname order across the index. The prefix applies before pagination.'}</p></div>
          <div className="flex flex-wrap items-center gap-3">
            {search.query === undefined ? null : <Link to="/market" search={{ ...presentation, view: 'providers' }} resetScroll={false} className="min-h-11 inline-flex items-center text-sm underline underline-offset-4">Clear prefix</Link>}
            <SegmentedControl label="Host result layout" options={[{ value: 'grid', label: 'Cards' }, { value: 'table', label: 'Table' }]} value={presentation.layout} onValueChange={value => {
              if (value === 'grid' || value === 'table') void navigate({ to: '/market', search: { ...hosts, layout: value }, resetScroll: false })
            }} />
          </div>
        </div>
        <DirectoryProvidersIndex result={result} search={hosts} />
        {result.kind === 'ok' ? <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Coinbase Bazaar index · refreshed {new Date(result.coverage.completedAt).toLocaleDateString('en-AU', { timeZone: 'UTC' })}. Listing details may change after this scan. Browser Back returns to the prior Host page.</p> : null}
      </TabsContent>
    </Tabs>
  </div>
}
