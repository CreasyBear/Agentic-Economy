// Mercur identity composition; official shadcn Card and Avatar primitives.
// Source notices: docs/licenses/mercur.txt and docs/licenses/shadcn-ui.txt.
import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, StoreIcon } from 'lucide-react'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import { useMarketPath } from './market-navigation-context'

type Props = { result: X402DirectoryProvidersPage }

export function DirectoryProvidersIndex({ result }: Props) {
  const marketPath = useMarketPath()
  if (result.kind === 'unavailable') {
    return <>
      <AeCollectionRail kicker="Providers" title="Explore Providers" className="mb-5" />
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
  return <section aria-label="Provider catalogue" className="flex flex-col gap-6">
    <p className="text-sm text-muted-foreground">Provider hostnames from the indexed catalogue. Tool counts cover the completed directory scan.</p>
    {result.page.length === 0 ? <p role="status" className="rounded-card border border-border p-8 text-muted-foreground">No Providers on this page.</p> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {result.page.map(provider => <Card key={provider.key} discoverLift className="gap-0 overflow-hidden border-border/70 py-0 shadow-none">
        <CardContent className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex items-start gap-3">
            <Avatar className="size-12 shrink-0 rounded-xl border border-border bg-background">
              {provider.iconUrl === undefined ? null : <AvatarImage src={provider.iconUrl} alt={`Sample service icon from ${provider.key}`} className="object-cover" />}
              <AvatarFallback className="rounded-xl text-sm" aria-hidden="true">{provider.key.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-medium uppercase tracking-caption text-muted-foreground">Provider hostname</p>
              <h3 className="mt-1 break-all text-lg font-semibold leading-snug tracking-tight">{provider.key}</h3>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{provider.count.toLocaleString()} {provider.count === 1 ? 'Tool' : 'Tools'} in the indexed catalogue</p>
          <Link to={marketPath} search={{ view: 'tools', provider: provider.key }} className="mt-auto flex min-h-11 items-center justify-between rounded-full border border-border px-4 text-sm font-medium hover:bg-muted" aria-label={`View Tools from ${provider.key}`}>Explore Tools<ArrowUpRight className="size-4" /></Link>
        </CardContent>
      </Card>)}
    </div>}
    <nav aria-label="Provider catalogue pages" className="flex items-center justify-between gap-4">
      <Link to={marketPath} search={{ view: 'providers' }} className="text-sm text-muted-foreground underline underline-offset-4">First page</Link>
      {!result.isDone && <Link to={marketPath} search={{ view: 'providers', providerCursor: result.continueCursor }} className="flex min-h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium hover:bg-muted">Next Providers<ArrowRight className="size-4" /></Link>}
    </nav>
  </section>
}
