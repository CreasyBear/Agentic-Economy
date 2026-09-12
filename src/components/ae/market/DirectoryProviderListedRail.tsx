import { Link } from '@tanstack/react-router'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import type { ToolCardViewModel } from '@/modules/market/tool-view-model'

/**
 * A Provider-owned Tool admitted to the live registry (`source: "current"`),
 * shown with the same placard shape as `DirectoryToolCard` (identity, title
 * link, summary, price footer) so this rail reads as one directory, not a
 * second design. The registry projection does not yet carry a canonical
 * `/tools/<providerHost>/<slug>` slug for these Tools, so the card links to
 * `/tools/$toolRef`, which redirects to the canonical URL once one exists.
 */
function ProviderListedCard({ tool }: Readonly<{ tool: ToolCardViewModel }>) {
  return (
    <Card className="group relative h-full gap-0 overflow-hidden border border-border/70 p-0 shadow-none transition-[box-shadow,transform] duration-200 hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none">
      <div className="relative p-5 pb-0">
        <Avatar className="size-14 rounded-xl border border-border/60 bg-card">
          <AvatarFallback className="rounded-xl text-sm">{tool.providerInitials}</AvatarFallback>
        </Avatar>
        <div className="mt-4 min-w-0">
          <p className="truncate text-xs text-muted-foreground">{tool.providerName}</p>
          <h3 className="mt-2 min-w-0 text-lg font-semibold leading-snug tracking-tight">
            <Link to="/tools/$toolRef" params={{ toolRef: tool.toolRef }} className="line-clamp-3 break-words after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{tool.title}</Link>
          </h3>
        </div>
      </div>
      <CardContent className="grid flex-1 content-start gap-3 p-5 pt-3">
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{tool.summary}</p>
        <div className="flex flex-wrap gap-1.5"><Badge variant="secondary" className="max-w-full truncate">{tool.category.label}</Badge></div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 border-t border-border px-5 py-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold tabular-nums">{tool.price}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">Listed by the Provider</p>
        </div>
      </CardFooter>
    </Card>
  )
}

/**
 * "Listed by Providers" rail for the directory landing: Provider-owned
 * publications are absent from the Coinbase-indexed collections above (see
 * `readProviderListedToolsProjection`), so this reads the admitted registry
 * directly. Renders nothing when there are no Provider-owned Tools yet -
 * there is no honest empty state for "nobody has listed one".
 */
export function DirectoryProviderListedRail({ items }: Readonly<{ items: readonly ToolCardViewModel[] }>) {
  if (items.length === 0) return null
  return (
    <section className="mb-12 min-w-0" aria-labelledby="directory-provider-listed">
      <div className="mb-5 max-w-2xl">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Providers</p>
        <h2 id="directory-provider-listed" className="text-2xl font-medium tracking-tight sm:text-3xl">Listed by Providers</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Tools Providers have listed directly with Agentic Economy.</p>
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.slice(0, 8).map((tool) => <li key={tool.toolRef} className="min-w-0"><ProviderListedCard tool={tool} /></li>)}
      </ul>
    </section>
  )
}
