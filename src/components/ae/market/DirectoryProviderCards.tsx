// Adapted from Mercur's provider identity/header components.
// MIT licence and source attribution: docs/licenses/mercur.txt.
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardFooter } from '@/components/ui/card'
import { directoryInitials } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

type Props = { entries: readonly X402DirectoryEntry[]; onSelect: (provider: string) => void }

export function DirectoryProviderCards({ entries, onSelect }: Props) {
  const groups = new Map<string, Map<string, X402DirectoryEntry>>()
  for (const entry of entries) {
    const group = groups.get(entry.provider) ?? new Map<string, X402DirectoryEntry>()
    group.set(entry.resource, entry)
    groups.set(entry.provider, group)
  }
  return <div className="grid gap-related md:grid-cols-2 xl:grid-cols-3">
    {[...groups].map(([provider, group]) => {
      const tools = [...group.values()]
      const tags = [...new Set(tools.flatMap(tool => [...(tool.category === undefined ? [] : [tool.category]), ...(tool.tags ?? [])]))].slice(0, 3)
      const networks = [...new Set(tools.flatMap(tool => tool.prices.map(price => price.networkLabel ?? price.network)))]
      const mark = tools.find(tool => tool.iconUrl !== undefined)
      return <Card key={provider} discoverLift className="grid h-full grid-rows-[auto_1fr_auto] gap-0 overflow-hidden border border-border/70 p-0 shadow-none">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-related px-gutter pt-related">
          <Avatar className="size-9 rounded-lg border border-border/70 bg-muted/40">
            {mark?.iconUrl === undefined ? null : <AvatarImage src={mark.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
            <AvatarFallback className="rounded-lg bg-transparent text-xs font-medium">{directoryInitials(provider)}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 gap-intra">
            <h3 className="truncate text-base font-medium leading-snug">{provider}</h3>
            <p className="text-sm text-muted-foreground">{tools.length} {tools.length === 1 ? 'Tool' : 'Tools'} in these results</p>
          </div>
        </div>
        <div className="grid content-start gap-related px-gutter py-related">
          <ul className="grid gap-related" aria-label={`Tools from ${provider}`}>{tools.slice(0, 3).map(tool => <li key={tool.resource} className="grid gap-intra">
            <p className="line-clamp-2 text-sm font-medium">{tool.title}</p>
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
          </li>)}</ul>
          {tags.length > 0 ? <div className="flex flex-wrap gap-intra">{tags.map(tag => <Badge key={tag} variant="outline">{tag}</Badge>)}</div> : null}
          {networks.length > 0 ? <p className="text-xs text-muted-foreground">Networks in these results: {networks.join(' · ')}</p> : null}
        </div>
        <CardFooter className="border-t border-border px-gutter py-related">
          <Button variant="outline" size="sm" onClick={() => onSelect(provider)} aria-label={`View Tools from ${provider}`}>
            See their Tools
          </Button>
        </CardFooter>
      </Card>
    })}
  </div>
}
