// Adapted from Spree Storefront ProductCard.tsx (MIT).
// Copyright (c) 2026 Vendo Connect Inc., Vendo Sp. z o.o.
// See docs/licenses/spree-storefront.txt for licence and source provenance.
import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon, CheckIcon, HeartIcon, PlusIcon } from 'lucide-react'
import { memo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { x402PendingToolRef, type X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { MarketReturnContext } from './market-return-context'
import { DirectoryToolIdentity } from './DirectoryToolIdentity'
import { directoryDate, directoryNetworkLabel, directoryOutputLabel, directoryPrice, directoryTitle } from './directory-presentation'

type DirectoryToolCardProps = Readonly<{
  entry: X402DirectoryEntry
  returnTo?: MarketReturnContext
  onSave?: () => void
  saved?: boolean
  onCompare?: () => void
  comparing?: boolean
  compareDisabled?: boolean
}>

export const DirectoryToolCard = memo(function DirectoryToolCard({ entry, returnTo, onSave, saved, onCompare, comparing, compareDisabled }: DirectoryToolCardProps) {
  const network = directoryNetworkLabel(entry)
  const title = directoryTitle(entry)
  const description = entry.description !== title ? entry.description : entry.schemaSummary
  const output = directoryOutputLabel(entry)
  return (
    <Card className="group relative h-full gap-0 overflow-hidden border border-border/70 p-0 shadow-none transition-[box-shadow,transform] duration-200 hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none">
      <div className="relative p-5 pb-0">
        <div className="flex items-start justify-between gap-3">
          <DirectoryToolIdentity entry={entry} className="size-14" />
          {onSave === undefined ? <ArrowUpRightIcon className="size-4 text-muted-foreground" aria-hidden="true" /> : <Button variant="ghost" size="icon-sm" className="relative z-10 rounded-full" onClick={onSave} aria-label={`${saved ? 'Unsave' : 'Save'} ${title}`} aria-pressed={saved === true}>
            <HeartIcon className={cn(saved && 'fill-current')} />
          </Button>}
        </div>
        <div className="mt-4 min-w-0">
          <p className="truncate text-xs text-muted-foreground">{entry.serviceName === undefined ? entry.provider : `${entry.serviceName} · ${entry.provider}`}</p>
          <div className="mt-2 flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-lg font-semibold leading-snug tracking-tight">
            <Link to="/tools/$toolRef" params={{ toolRef: x402PendingToolRef(entry.resource) }} {...(returnTo === undefined ? {} : { search: { from: returnTo } })} className="line-clamp-3 break-words after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{title}</Link>
          </h3>
          </div>
        </div>
      </div>
      <CardContent className="grid flex-1 content-start gap-3 p-5 pt-3">
        {description ? <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        {entry.tags?.length || entry.category ? <div className="flex flex-wrap gap-1.5">{[...new Set([...(entry.category === undefined ? [] : [entry.category]), ...(entry.tags ?? [])])].slice(0, 2).map(tag => <Badge key={tag} variant="secondary" className="max-w-full truncate">{tag}</Badge>)}</div> : null}
        {output === undefined ? null : <p className="truncate text-xs text-muted-foreground" title={output}>Returns {output}</p>}
        {entry.activity?.calls30d !== undefined && entry.activity.calls30d > 0
          ? <p className="text-xs text-muted-foreground" title="Reported by Coinbase Bazaar in the past 30 days">Used recently by other agents</p>
          : entry.provenance?.updatedAt !== undefined
            ? <p className="text-xs text-muted-foreground">Verified {directoryDate(entry.provenance.updatedAt)}</p>
            : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 border-t border-border px-5 py-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold tabular-nums">{directoryPrice(entry)}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{network ?? 'Provider price'}{entry.prices.length > 1 ? ` · ${entry.prices.length} payment options` : ' · per Call'}</p>
        </div>
        {onCompare === undefined ? null : <Button variant="ghost" size="icon-sm" className="relative z-10" onClick={onCompare} disabled={compareDisabled === true} aria-label={`${comparing ? 'Remove' : 'Add'} ${title} ${comparing ? 'from' : 'to'} comparison`} aria-pressed={comparing === true}>
          {comparing ? <CheckIcon /> : <PlusIcon />}
        </Button>}
      </CardFooter>
    </Card>
  )
})
