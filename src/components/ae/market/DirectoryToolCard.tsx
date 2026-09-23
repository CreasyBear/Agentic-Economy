// Adapted from Spree Storefront ProductCard.tsx (MIT).
// Copyright (c) 2026 Vendo Connect Inc., Vendo Sp. z o.o.
// See docs/licenses/spree-storefront.txt for licence and source provenance.
import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon, CheckIcon, HeartIcon } from 'lucide-react'
import { memo } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardFooter } from '@/components/ui/card'
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
    <div className="group h-full">
    <Card className="grid h-full grid-rows-[auto_1fr_auto] gap-0 overflow-hidden border border-border/70 p-0 shadow-none transition-[box-shadow,transform,border-color] duration-fast ease-standard group-hover:-translate-y-1 hover:shadow-float group-hover:shadow-float motion-reduce:transform-none motion-reduce:transition-none">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-related gap-y-intra px-gutter pt-related">
        <Avatar className="size-9 rounded-lg border border-border/70 bg-muted/40">
          {model.iconUrl === undefined ? null : <AvatarImage src={model.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
          <AvatarFallback className="rounded-lg bg-transparent text-xs font-medium">{model.initials}</AvatarFallback>
        </Avatar>
        <p className="min-w-0 truncate text-xs text-muted-foreground">{model.providerLine}</p>
        {onSave === undefined
          ? <ArrowUpRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          : (
            <Button variant="ghost" size="icon-sm" className="relative z-10 active:scale-100" onClick={onSave} aria-label={`${saved ? 'Unsave' : 'Save'} ${model.title}`} aria-pressed={saved === true}>
              <HeartIcon className={cn(saved && 'fill-current')} />
            </Button>
          )}
        <h3 className="col-span-3 line-clamp-2 h-11 text-base font-medium leading-snug">
          <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="break-words after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{model.title}</Link>
        </h3>
      </div>
      <div className="grid content-start gap-intra px-gutter py-related">
        {model.glance === undefined ? null : <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{model.glance}</p>}
        {model.activityLabel === undefined ? null : <p className="text-xs text-muted-foreground" {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}>{model.activityLabel}</p>}
      </div>
      <CardFooter className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-related border-t border-border px-gutter py-related">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium tabular-nums">{model.priceLabel}</p>
          <p className="truncate text-xs text-muted-foreground">{model.priceContext}</p>
        </div>
        {onCompare === undefined ? null : <Button variant={comparing ? 'secondary' : 'ghost'} size="sm" className="relative z-10 active:scale-100" onClick={onCompare} disabled={compareDisabled === true} aria-label={`${comparing ? 'Remove' : 'Add'} ${model.title} ${comparing ? 'from' : 'to'} comparison`} aria-pressed={comparing === true}>
          {comparing ? <CheckIcon aria-hidden="true" /> : null}
          Compare
        </Button>}
      </CardFooter>
    </Card>
    </div>
  )
})
