// Adapted from Spree Storefront ProductCard.tsx (MIT).
// Copyright (c) 2026 Vendo Connect Inc., Vendo Sp. z o.o.
// See docs/licenses/spree-storefront.txt for licence and source provenance.
import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon, BracesIcon, CheckIcon, HeartIcon } from 'lucide-react'
import { memo } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { DirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import { MARKET_LINK_STATE } from './market-return-context'

type DirectoryToolCardProps = Readonly<{
  model: DirectoryToolCardModel
  onSave?: () => void
  saved?: boolean
  onCompare?: () => void
  comparing?: boolean
  compareDisabled?: boolean
}>

export const DirectoryToolCard = memo(function DirectoryToolCard({ model, onSave, saved, onCompare, comparing, compareDisabled }: DirectoryToolCardProps) {
  return (
    <Card className="group relative h-full gap-0 overflow-hidden border border-border/70 p-0 shadow-none transition-[box-shadow,transform] duration-200 hover:-translate-y-1 hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none">
      <div className="relative p-5 pb-0">
        <div className="flex items-start justify-between gap-3">
          <Avatar className={cn('size-12 rounded-xl border border-border/60 bg-card', 'size-14')}>
            {model.iconUrl === undefined ? null : <AvatarImage src={model.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
            <AvatarFallback className="rounded-xl"><BracesIcon className="size-5" aria-hidden="true" /></AvatarFallback>
          </Avatar>
          {onSave === undefined ? <ArrowUpRightIcon className="size-4 text-muted-foreground" aria-hidden="true" /> : <Button variant="ghost" size="icon-sm" className="relative z-10 rounded-full" onClick={onSave} aria-label={`${saved ? 'Unsave' : 'Save'} ${model.title}`} aria-pressed={saved === true}>
            <HeartIcon className={cn(saved && 'fill-current')} />
          </Button>}
        </div>
        <div className="mt-4 min-w-0">
          <p className="truncate text-xs text-muted-foreground">{model.providerLine}</p>
          <div className="mt-2 flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-lg font-semibold leading-snug tracking-tight">
            <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="line-clamp-3 break-words after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{model.title}</Link>
          </h3>
          </div>
        </div>
      </div>
      <CardContent className="grid flex-1 content-start gap-3 p-5 pt-3">
        {model.description === undefined ? null : <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{model.description}</p>}
        {model.tags.length === 0 ? null : <div className="flex flex-wrap gap-1.5">{model.tags.map(tag => <Badge key={tag} variant="secondary" className="max-w-full truncate">{tag}</Badge>)}</div>}
        {model.outputLabel === undefined ? null : <p className="truncate text-xs text-muted-foreground" title={model.outputLabel}>Returns {model.outputLabel}</p>}
        {model.activityLabel === undefined ? null : <p className="text-xs text-muted-foreground" {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}>{model.activityLabel}</p>}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 border-t border-border px-5 py-3">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">Provider-listed price</p>
          <p className="mt-0.5 break-words text-sm font-medium tabular-nums">{model.priceLabel}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{model.priceContext}</p>
        </div>
        {onCompare === undefined ? null : <Button variant={comparing ? 'secondary' : 'ghost'} size="sm" className="relative z-10" onClick={onCompare} disabled={compareDisabled === true} aria-label={`${comparing ? 'Remove' : 'Add'} ${model.title} ${comparing ? 'from' : 'to'} comparison`} aria-pressed={comparing === true}>
          {comparing ? <CheckIcon aria-hidden="true" /> : null}
          Compare
        </Button>}
      </CardFooter>
    </Card>
  )
})
