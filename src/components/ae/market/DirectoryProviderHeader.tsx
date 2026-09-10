// Provider identity composition adapted from Mercur; docs/licenses/mercur.txt.
import { ArrowUpRight, Globe2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { x402DirectoryFilterSchema, type X402DirectoryEntry } from '@/modules/market/x402-directory'

type Props = Readonly<{ provider: string; entries: readonly X402DirectoryEntry[]; totalTools?: number }>

export function DirectoryProviderHeader({ provider, entries, totalTools }: Props) {
  const tools = [...new Map(entries.filter(entry => entry.provider === provider).map(entry => [entry.resource, entry])).values()]
  const labels = [...new Set(tools.flatMap(tool => [...(tool.category === undefined ? [] : [tool.category]), ...(tool.tags ?? [])]))].slice(0, 6)
  const networks = [...new Set(tools.flatMap(tool => tool.prices.map(price => price.networkLabel ?? price.network)))]
  const reportedCalls = tools.flatMap(tool => {
    const calls30d = tool.activity?.calls30d
    return calls30d !== undefined && Number.isSafeInteger(calls30d) && calls30d >= 0 ? [calls30d] : []
  })
  const calls = reportedCalls.reduce((sum, value) => sum + BigInt(value), 0n)
  const validHost = x402DirectoryFilterSchema.safeParse({ provider })
  const total = totalTools !== undefined && Number.isSafeInteger(totalTools) && totalTools >= tools.length ? totalTools : undefined
  const updates = tools.flatMap(tool => {
    const date = tool.provenance?.updatedAt
    return date !== undefined && Number.isFinite(Date.parse(date)) ? [Date.parse(date)] : []
  })
  const latestUpdate = updates.length === 0 ? undefined : new Date(Math.max(...updates)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return <section aria-label={`Provider ${provider}`} className="mb-8 overflow-hidden rounded-2xl border border-border bg-card">
    <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.65fr)]">
      <div className="flex flex-col items-start gap-4">
        <p className="flex items-center gap-2 text-xs tracking-wide text-muted-foreground"><Globe2 className="size-4" />PROVIDER HOSTNAME</p>
        <h2 className="break-all text-3xl font-medium tracking-tight sm:text-4xl">{provider}</h2>
        <p className="text-sm text-muted-foreground">{total === undefined ? `${tools.length} ${tools.length === 1 ? 'Tool' : 'Tools'} in these results` : `${total.toLocaleString()} ${total === 1 ? 'Tool' : 'Tools'} in the indexed catalogue`}</p>
        {labels.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Provider-declared categories and tags">{labels.map(label => <Badge key={label} variant="secondary" className="rounded-full px-3 py-1">{label}</Badge>)}</div>}
        {validHost.success && <Button asChild variant="outline" className="mt-1 rounded-full"><a href={`https://${validHost.data.provider}/`} target="_blank" rel="noopener noreferrer">Visit {provider}<ArrowUpRight className="size-4" /></a></Button>}
      </div>
      {tools.length > 0 && <div className="grid content-start gap-4 rounded-xl bg-muted/40 p-5">
        <p className="text-xs font-medium text-muted-foreground">A few Tools from this hostname</p>
        <ul className="grid gap-4">{tools.slice(0, 3).map(tool => <li key={tool.resource} className="flex min-w-0 items-center gap-3">
          <Avatar className="size-12 shrink-0 rounded-xl border border-border bg-background">
            {tool.iconUrl === undefined ? null : <AvatarImage src={tool.iconUrl} alt={`${tool.title} service icon`} className="object-cover" />}
            <AvatarFallback className="rounded-xl bg-background text-sm" aria-hidden="true">{tool.title.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0"><p className="line-clamp-2 text-sm font-medium">{tool.title}</p><p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{tool.description}</p></div>
        </li>)}</ul>
      </div>}
    </div>
    {(networks.length > 0 || reportedCalls.length > 0 || latestUpdate !== undefined) && <div className="grid gap-4 border-t border-border px-6 py-5 text-xs text-muted-foreground sm:px-8 md:grid-cols-3">
      {networks.length > 0 && <div><p className="mb-1 font-medium text-foreground">Payment networks in these results</p><p>{networks.join(' · ')}</p></div>}
      {reportedCalls.length > 0 && <div><p className="mb-1 font-medium text-foreground">{calls.toLocaleString()} reported Calls in 30 days</p><p>Across {reportedCalls.length} {reportedCalls.length === 1 ? 'Tool' : 'Tools'} in these results · Coinbase Bazaar</p></div>}
      {latestUpdate !== undefined && <div><p className="mb-1 font-medium text-foreground">Latest directory update</p><p>{latestUpdate} · among these results</p></div>}
    </div>}
  </section>
}
