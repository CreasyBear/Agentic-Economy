// Adapted from Mercur's provider identity/header components.
// MIT licence and source attribution: docs/licenses/mercur.txt.
import { ArrowUpRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

type Props = { entries: readonly X402DirectoryEntry[]; onSelect: (provider: string) => void }

export function DirectoryProviderCards({ entries, onSelect }: Props) {
  const groups = new Map<string, Map<string, X402DirectoryEntry>>()
  for (const entry of entries) {
    const group = groups.get(entry.provider) ?? new Map<string, X402DirectoryEntry>()
    group.set(entry.resource, entry)
    groups.set(entry.provider, group)
  }
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    {[...groups].map(([provider, group]) => {
      const tools = [...group.values()]
      const tags = [...new Set(tools.flatMap(tool => [...(tool.category === undefined ? [] : [tool.category]), ...(tool.tags ?? [])]))].slice(0, 3)
      const networks = [...new Set(tools.flatMap(tool => tool.prices.map(price => price.networkLabel ?? price.network)))]
      return <Card key={provider} discoverLift className="gap-0 overflow-hidden border-border/70 py-0 shadow-none">
        <CardContent className="flex flex-1 flex-col gap-5 p-5">
          <div className="min-w-0">
            <p className="text-caption font-medium uppercase tracking-caption text-muted-foreground">Provider hostname</p>
            <h3 className="mt-1 break-all text-lg font-semibold leading-snug tracking-tight">{provider}</h3>
            <p className="mt-2 text-xs text-muted-foreground">{tools.length} {tools.length === 1 ? 'Tool' : 'Tools'} in these results</p>
          </div>
          <ul className="grid gap-4" aria-label={`Tools from ${provider}`}>{tools.slice(0, 3).map(tool => <li key={tool.resource} className="flex items-start gap-3">
            <Avatar className="size-11 shrink-0 rounded-xl border border-border">
              {tool.iconUrl === undefined ? null : <AvatarImage src={tool.iconUrl} alt={`${tool.title} service icon`} className="object-cover" />}
              <AvatarFallback className="rounded-xl text-xs" aria-hidden="true">{tool.title.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0"><p className="line-clamp-2 text-sm font-medium">{tool.title}</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p></div>
          </li>)}</ul>
          {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map(tag => <Badge key={tag} variant="secondary" className="rounded-full text-xs">{tag}</Badge>)}</div>}
          {networks.length > 0 && <p className="text-xs text-muted-foreground">Networks in these results: {networks.join(' · ')}</p>}
          <Button variant="outline" className="mt-auto w-full rounded-full" onClick={() => onSelect(provider)} aria-label={`View Tools from ${provider}`}>
            Explore Tools<ArrowUpRight className="size-4" />
          </Button>
        </CardContent>
      </Card>
    })}
  </div>
}
