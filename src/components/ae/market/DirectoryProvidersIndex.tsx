// Mercur identity composition; official shadcn Card and Avatar primitives.
// Source notices: docs/licenses/mercur.txt and docs/licenses/shadcn-ui.txt.
import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, Globe2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { MarketWindow } from '@/modules/market/contracts'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'

type Props = { result: X402DirectoryProvidersPage; window: MarketWindow }

export function DirectoryProvidersIndex({ result, window }: Props) {
  if (result.kind === 'unavailable') return <div role="status" className="rounded-2xl border border-border p-8 text-sm text-muted-foreground">The Provider catalogue is unavailable. Try again shortly.</div>
  return <section aria-label="Provider catalogue" className="flex flex-col gap-6">
    <p className="text-sm text-muted-foreground">Provider hostnames from the indexed catalogue. Tool counts cover the completed directory scan.</p>
    {result.page.length === 0 ? <p role="status" className="rounded-2xl border border-border p-8 text-muted-foreground">No Providers on this page.</p> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {result.page.map(provider => <Card key={provider.key} className="gap-0 overflow-hidden border border-border bg-card py-0 shadow-none">
        <CardHeader className="gap-4 border-b border-border bg-muted/30 p-5">
          <div className="flex items-center gap-3">
            <Avatar className="size-12 shrink-0 rounded-xl border border-border bg-background">
              {provider.iconUrl === undefined ? null : <AvatarImage src={provider.iconUrl} alt={`Sample service icon from ${provider.key}`} className="object-cover" />}
              <AvatarFallback className="rounded-xl text-sm" aria-hidden="true">{provider.key.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <p className="flex items-center gap-2 text-[10px] tracking-wide text-muted-foreground"><Globe2 className="size-3.5" />PROVIDER HOSTNAME</p>
          </div>
          <h3 className="break-all text-xl font-medium tracking-tight">{provider.key}</h3>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-5 p-5">
          <p className="text-sm text-muted-foreground">{provider.count.toLocaleString()} {provider.count === 1 ? 'Tool' : 'Tools'} in the indexed catalogue</p>
          <Link to="/market" search={{ window, view: 'tools', provider: provider.key }} className="mt-auto flex min-h-11 items-center justify-between rounded-full border border-border px-4 text-sm font-medium hover:bg-muted" aria-label={`View Tools from ${provider.key}`}>Explore Tools<ArrowUpRight className="size-4" /></Link>
        </CardContent>
      </Card>)}
    </div>}
    <nav aria-label="Provider catalogue pages" className="flex items-center justify-between gap-4">
      <Link to="/market" search={{ window, view: 'providers' }} className="text-sm text-muted-foreground underline underline-offset-4">First page</Link>
      {!result.isDone && <Link to="/market" search={{ window, view: 'providers', providerCursor: result.continueCursor }} className="flex min-h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium hover:bg-muted">Next Providers<ArrowRight className="size-4" /></Link>}
    </nav>
  </section>
}
