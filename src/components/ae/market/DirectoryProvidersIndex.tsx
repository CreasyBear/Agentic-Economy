// Mercur identity composition; official shadcn Table and Avatar primitives.
// Source notices: docs/licenses/mercur.txt and docs/licenses/shadcn-ui.txt.
import { Link } from '@tanstack/react-router'
import { ArrowRight, StoreIcon } from 'lucide-react'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { toDirectoryProviderRow } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import { MARKET_LINK_STATE } from './market-return-context'
import { useMarketPath } from './market-navigation-context'

export type DirectoryProvidersIndexProps = Readonly<{ result: X402DirectoryProvidersPage }>

export function DirectoryProvidersIndex({ result }: DirectoryProvidersIndexProps) {
  const marketPath = useMarketPath()
  if (result.kind === 'unavailable') {
    return <>
      <AeCollectionRail kicker="Hosts" title="Explore Providers" className="mb-5" />
      <AeEmptyState
        icon={<StoreIcon />}
        title="Provider catalogue temporarily unavailable"
        description="The discovery service could not be reached. Try again."
        action={<>
          <Link to={marketPath} reloadDocument search={{ view: 'providers' }} className={cn(buttonVariants({ variant: 'outline' }))}>Try again</Link>
          <Link to={marketPath} search={{ view: 'tools' }} className={cn(buttonVariants({ variant: 'outline' }))}>Browse Tools</Link>
        </>}
      />
    </>
  }
  const ranked = result.page.some(provider => provider.leadCalls !== undefined && provider.leadCalls >= 0)
  return <section aria-label="Provider catalogue" className="grid gap-section">
    <AeCollectionRail
      kicker="Hosts"
      title="Providers"
      deck={ranked
        ? 'Sorted by the busiest Tool. Calls, payers, and price belong to that Tool. The count is the whole host.'
        : 'Open a host to see the Tools they list. Counts cover the whole indexed catalogue.'}
    />
    {result.page.length === 0 ? <p role="status" className="rounded-card border border-border px-gutter py-section text-muted-foreground">No Providers on this page.</p> : <Table aria-label="Providers">
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-64">Provider</TableHead>
          {ranked ? <TableHead className="text-right">Price</TableHead> : null}
          {ranked ? <TableHead className="text-right">Calls</TableHead> : null}
          {ranked ? <TableHead className="text-right">Payers</TableHead> : null}
          <TableHead className="text-right">Tools</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.page.map(provider => {
          const model = toDirectoryProviderRow(provider)
          return <TableRow key={model.key}>
            <TableCell className="whitespace-normal">
              <div className="flex min-w-0 items-start gap-related">
                <Avatar className="mt-0.5 size-8 rounded-lg border border-border/70 bg-muted/40">
                  {model.iconUrl === undefined ? null : <AvatarImage src={model.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
                  <AvatarFallback className="rounded-lg bg-transparent text-xs font-medium">{model.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium leading-snug">
                    <Link to={marketPath} search={{ view: 'tools', provider: model.key }} aria-label={`View Tools from ${model.key}`} className="break-words hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{model.key}</Link>
                  </h3>
                  {model.leadTitle === undefined ? null : model.leadSlug === undefined ? <p className="line-clamp-1 text-xs text-muted-foreground">{model.leadTitle}</p> : <p className="line-clamp-1 text-xs text-muted-foreground">
                    <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.key, slug: model.leadSlug }} state={MARKET_LINK_STATE} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{model.leadTitle}</Link>
                  </p>}
                </div>
              </div>
            </TableCell>
            {ranked ? <TableCell className="text-right tabular-nums">
              <p className="text-sm">{model.priceLabel}</p>
              {model.priceSourceLabel === undefined ? null : <p className="text-xs text-muted-foreground">{model.priceSourceLabel}</p>}
            </TableCell> : null}
            {ranked ? <TableCell className="text-right text-sm tabular-nums" title="Busiest Tool on this host, last 30 days. Coinbase Bazaar.">{model.callsLabel}</TableCell> : null}
            {ranked ? <TableCell className="text-right text-sm tabular-nums">{model.payersLabel}</TableCell> : null}
            <TableCell className="text-right text-sm tabular-nums" title={`${model.toolLabel} ${provider.count === 1 ? 'Tool' : 'Tools'} in the indexed catalogue`}>{model.toolLabel}</TableCell>
          </TableRow>
        })}
      </TableBody>
    </Table>}
    <nav aria-label="Provider catalogue pages" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-related">
      <Link to={marketPath} search={{ view: 'providers' }} className="justify-self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">First page</Link>
      {!result.isDone && <Link to={marketPath} search={{ view: 'providers', providerCursor: result.continueCursor }} className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch')}>Next Providers<ArrowRight className="size-4" /></Link>}
    </nav>
  </section>
}
