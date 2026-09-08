import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon, HeartIcon, MedalIcon, TrophyIcon } from 'lucide-react'
import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { MarketWindow } from '@/modules/market/contracts'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { cn } from '@/lib/utils'
import type { SavedDirectoryTool } from './DirectorySavedTools'
import { DirectoryToolIdentity } from './DirectoryToolIdentity'
import { directoryCount, directoryNetworkLabel, directoryPrice, directoryTitle } from './directory-presentation'

type Props = Readonly<{
  /** First page of the catalogue ordered by reported calls30d; retain its rank order. */
  entries: readonly X402DirectoryEntry[]
  window: MarketWindow
  onSelect: (item: SavedDirectoryTool) => void
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (resource: string) => boolean
}>

export function DirectoryLeaderboard({ entries, window, onSelect, onSave, isSaved }: Props) {
  const id = useId()
  const leaders = entries.slice(0, 12)
  const leadingCalls = reportedCalls(leaders[0])
  const hasActivity = leadingCalls !== undefined && leadingCalls > 0
  return <section aria-labelledby={`${id}-title`} className="min-w-0">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 id={`${id}-title`} className="text-2xl font-medium tracking-tight sm:text-3xl">Most-used Tools</h2>{hasActivity ? <Badge variant="secondary">Top {leaders.length}</Badge> : null}</div><p className="mt-2 text-sm text-muted-foreground">Last 30 days · reported by Coinbase Bazaar</p></div>
      <Button asChild variant="ghost" size="sm" className="rounded-full"><Link to="/market" search={{ window, view: 'tools', sort: 'popular' }}>Browse by usage<ArrowUpRightIcon /></Link></Button>
    </div>
    {!hasActivity ? <Card className="border-dashed shadow-none"><CardContent className="py-3"><h3 className="text-base font-medium">No Call activity reported yet</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">A ranking will appear when the directory reports Calls in the last 30 days.</p></CardContent></Card> : <>
      <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardContent className="p-0"><ol className="divide-y divide-border" aria-label="Top Tools by reported Calls in the last 30 days">
        {leaders.map((entry, index) => {
          const rank = index + 1
          const title = directoryTitle(entry)
          const network = directoryNetworkLabel(entry)
          const calls = reportedCalls(entry)
          const proportion = calls === undefined ? undefined : Math.min(100, calls / leadingCalls * 100)
          const item: SavedDirectoryTool = { entry, search: {} }
          const saved = isSaved(entry.resource)
          return <li key={entry.resource} aria-label={`Rank ${rank}: ${title}`} className={cn('grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-4 sm:p-5', rank === 1 && 'bg-brand-muted/50')}>
            <div className={cn('flex size-9 flex-col items-center justify-center rounded-xl text-sm font-semibold tabular-nums sm:size-11',
              rank === 1 && calls !== undefined && calls > 0 ? 'bg-warning-subtle text-warning-foreground' : rank === 2 && calls !== undefined && calls > 0 ? 'bg-muted text-foreground' : rank === 3 && calls !== undefined && calls > 0 ? 'bg-warning-subtle/60 text-warning' : 'text-muted-foreground')}
              aria-hidden="true">
              {rank === 1 && calls !== undefined && calls > 0 ? <TrophyIcon className="size-4" /> : rank <= 3 && calls !== undefined && calls > 0 ? <MedalIcon className="size-4" /> : null}<span className={rank <= 3 && calls !== undefined && calls > 0 ? 'text-[10px] leading-3' : ''}>{rank}</span>
            </div>
            <div className="grid min-w-0 items-center gap-4 md:grid-cols-[minmax(0,1fr)_8rem_auto] md:gap-4 lg:grid-cols-[minmax(0,1fr)_10rem_auto] lg:gap-6">
              <div className="flex min-w-0 items-start gap-3"><DirectoryToolIdentity entry={entry} className="size-10 shrink-0 rounded-xl sm:size-11" /><div className="min-w-0"><h3 className="line-clamp-2 break-words text-sm leading-snug font-semibold sm:text-base">{title}</h3><p className="mt-1 truncate text-xs text-muted-foreground" title={entry.provider}>{entry.provider}</p><p className="mt-1.5 break-words text-xs text-muted-foreground"><span>{directoryPrice(entry)}</span>{network === undefined ? null : <span> · {network}</span>}</p></div></div>
              <div className="grid min-w-0 gap-2">
                {calls === undefined ? <p className="text-sm text-muted-foreground">Calls not reported</p> : <>
                  <p className="text-sm font-medium tabular-nums"><span aria-hidden="true">{directoryCount(calls)} <span className="font-normal text-muted-foreground">Calls</span></span><span className="sr-only">{calls.toLocaleString('en-AU')} Calls in the last 30 days</span></p>
                  <div role="meter" aria-label={`${title} activity relative to the leading Tool`} aria-valuemin={0} aria-valuemax={leadingCalls} aria-valuenow={calls}
                    aria-valuetext={`${calls.toLocaleString('en-AU')} Calls; ${Math.round(proportion! * 10) / 10}% of the leading Tool`} className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand/65" style={{ width: `${proportion}%` }} />
                  </div>
                </>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="min-w-0 flex-1 rounded-full md:flex-none" onClick={() => onSelect(item)} aria-label={`View Tool: ${title}`}>View Tool<ArrowUpRightIcon /></Button>
                <Button variant="ghost" size="icon-sm" className="shrink-0 rounded-full" onClick={() => onSave(item)} aria-label={`${saved ? 'Unsave' : 'Save'} ${title}`} aria-pressed={saved}><HeartIcon className={saved ? 'fill-current' : ''} /></Button>
              </div>
            </div>
          </li>
        })}
      </ol></CardContent></Card>
      <p className="mt-3 text-xs text-muted-foreground">Activity bars compare reported Calls with the leading Tool.</p>
    </>}
  </section>
}

function reportedCalls(entry: X402DirectoryEntry | undefined): number | undefined {
  const calls = entry?.activity?.calls30d
  return calls !== undefined && Number.isFinite(calls) && calls >= 0 ? calls : undefined
}
