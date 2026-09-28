import { Link } from '@tanstack/react-router'
import { CheckIcon, HeartIcon } from 'lucide-react'
import { memo } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import { MARKET_LINK_STATE } from './market-return-context'

type DirectoryToolListProps = Readonly<{
  items: readonly SavedDirectoryTool[]
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (resource: string) => boolean
  onCompare: (item: SavedDirectoryTool) => void
  isComparing: (resource: string) => boolean
  compareDisabled: (resource: string) => boolean
}>

/** Semantic rows stack into decision cards at mobile widths without duplicate controls. */
export const DirectoryToolList = memo(function DirectoryToolList({ items, onSave, isSaved, onCompare, isComparing, compareDisabled }: DirectoryToolListProps) {
  return <Table aria-label="Tools" containerClassName="min-w-0 overflow-x-hidden md:overflow-x-auto" className="block min-w-0 md:table">
    <TableHeader className="hidden md:table-header-group">
      <TableRow>
        <TableHead className="min-w-64">Tool</TableHead>
        <TableHead>Access</TableHead>
        <TableHead className="text-right">Price</TableHead>
        <TableHead className="text-right">Coinbase Bazaar calls · 30 days</TableHead>
        <TableHead className="text-right"><span className="sr-only">Compare</span></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody className="grid min-w-0 gap-4 md:table-row-group">
      {items.map(item => {
        const model = toDirectoryToolCardModel(item.entry)
        const comparing = isComparing(item.entry.resource)
        const saved = isSaved(item.entry.resource)
        return <TableRow key={item.entry.resource} className="block min-w-0 rounded-card border border-border bg-card p-3 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0">
          <TableCell className="block min-w-0 whitespace-normal px-1 py-1 md:table-cell md:px-3 md:py-2.5">
                <div className="flex min-w-0 items-start gap-related">
                  <Avatar className="mt-0.5 size-8 rounded-lg border border-border/70 bg-muted/40">
                    {model.iconUrl === undefined ? null : <AvatarImage src={model.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
                    <AvatarFallback className="rounded-lg bg-transparent text-xs font-medium">{model.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium leading-snug">
                      <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="break-words underline decoration-transparent underline-offset-4 transition-[color,text-decoration-color] duration-fast ease-standard hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{model.title}</Link>
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">{model.providerLine}</p>
                    {model.glance === undefined ? null : <p className="line-clamp-1 text-xs text-muted-foreground">{model.glance}</p>}
                  </div>
                </div>
              </TableCell>
          <TableCell className="block whitespace-normal px-1 py-1 text-xs font-medium md:table-cell md:px-3 md:py-2.5 md:font-normal">{model.accessLabel}</TableCell>
          <TableCell className="block whitespace-normal px-1 py-1 md:table-cell md:px-3 md:py-2.5 md:text-right">
                <p className="text-sm font-medium tabular-nums">{model.priceLabel}</p>
                <p className="text-xs text-muted-foreground">{model.priceContext}</p>
              </TableCell>
          <TableCell className="block px-1 py-1 text-xs tabular-nums md:table-cell md:px-3 md:py-2.5 md:text-right" {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}>{model.callsLabel === undefined ? 'Coinbase Bazaar calls · 30 days: —' : <><span className="md:hidden">Coinbase Bazaar calls · 30 days: </span>{model.callsLabel}</>}</TableCell>
          <TableCell className="block px-1 py-1 md:table-cell md:px-3 md:py-2.5 md:text-right">
            <div className="flex items-center justify-between gap-2 md:justify-end">
              <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="inline-flex min-h-10 items-center rounded-md px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">Inspect Tool</Link>
                  <Button variant="ghost" size="icon-sm" className="active:scale-100" onClick={() => onSave(item)} aria-label={`${saved ? 'Unsave' : 'Save'} ${model.title}`} aria-pressed={saved}>
                    <HeartIcon className={cn(saved && 'fill-current')} />
                  </Button>
                  <Button variant={comparing ? 'secondary' : 'ghost'} size="sm" className="active:scale-100" onClick={() => onCompare(item)} disabled={compareDisabled(item.entry.resource)} aria-label={`${comparing ? 'Remove' : 'Add'} ${model.title} ${comparing ? 'from' : 'to'} comparison`} aria-pressed={comparing}>
                    {comparing ? <CheckIcon aria-hidden="true" /> : null}Compare
                  </Button>
            </div>
          </TableCell>
        </TableRow>
      })}
    </TableBody>
  </Table>
})
