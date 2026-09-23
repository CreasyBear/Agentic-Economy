// Provider identity composition adapted from Mercur; docs/licenses/mercur.txt.
import { ArrowUpRight } from 'lucide-react'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { directoryInitials } from '@/modules/market/directory-card.view-model'
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
  const mark = tools.find(tool => tool.iconUrl !== undefined)
  const countLabel = total === undefined
    ? `${tools.length} ${tools.length === 1 ? 'Tool' : 'Tools'} in these results`
    : `${total.toLocaleString('en-AU')} ${total === 1 ? 'Tool' : 'Tools'} in the indexed catalogue`
  return <section aria-label={`Provider ${provider}`} className="grid gap-section">
    <div className="grid gap-related sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <Avatar className="size-12 rounded-xl border border-border/60 bg-card">
        {mark?.iconUrl === undefined ? null : <AvatarImage src={mark.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
        <AvatarFallback className="rounded-xl text-sm font-medium">{directoryInitials(provider)}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 gap-intra">
        <h2 className="truncate text-xl font-medium tracking-tight text-foreground sm:text-2xl">{provider}</h2>
        <p className="text-sm text-muted-foreground">{countLabel}</p>
        <p className="text-sm text-muted-foreground">The Tools below are what they list.</p>
      </div>
      {validHost.success ? <a href={`https://${validHost.data.provider}/`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch w-fit justify-self-start')}>Visit {provider}<ArrowUpRight className="size-4" /></a> : null}
    </div>
    {labels.length > 0 ? <div className="flex flex-wrap gap-intra" aria-label="Provider-declared categories and tags">{labels.map(label => <Badge key={label} variant="outline">{label}</Badge>)}</div> : null}
    {networks.length > 0 || reportedCalls.length > 0 || latestUpdate !== undefined ? <AeFactList className="sm:grid-cols-3" facts={[
      ...(networks.length === 0 ? [] : [{ label: 'Payment networks in these results', value: networks.join(' · ') }]),
      ...(reportedCalls.length === 0 ? [] : [{ label: `${calls.toLocaleString('en-AU')} reported Calls in 30 days`, value: `Across ${reportedCalls.length} ${reportedCalls.length === 1 ? 'Tool' : 'Tools'} in these results · Coinbase Bazaar` }]),
      ...(latestUpdate === undefined ? [] : [{ label: 'Latest directory update', value: `${latestUpdate} · among these results` }]),
    ]} /> : null}
    {tools.length === 0 ? null : <ul className="m-0 divide-y divide-border border-y border-border p-0" aria-label={`Tools from ${provider}`}>
      {tools.slice(0, 3).map(tool => <li key={tool.resource} className="grid gap-intra py-related">
        <p className="text-base font-medium text-foreground">{tool.title}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
      </li>)}
    </ul>}
  </section>
}
