import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { groupDirectoryProviders, toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

export type DirectoryProviderListProps = Readonly<{
  entries: readonly X402DirectoryEntry[]
  onSelect: (provider: string) => void
}>

/** Provider-level browse: semantic rows stack without duplicate mobile controls. */
export function DirectoryProviderList({ entries, onSelect }: DirectoryProviderListProps) {
  const groups = groupDirectoryProviders(entries)
  return <Table aria-label="Providers" containerClassName="min-w-0 overflow-x-hidden md:overflow-x-auto" className="block min-w-0 md:table">
    <TableHeader className="hidden md:table-header-group"><TableRow>
      <TableHead className="min-w-64">Provider</TableHead>
      <TableHead className="text-right">AUD estimate</TableHead>
      <TableHead className="text-right">Coinbase Bazaar calls · 30 days</TableHead>
      <TableHead className="text-right">Coinbase Bazaar payers · 30 days</TableHead>
      <TableHead className="text-right">Tools</TableHead>
    </TableRow></TableHeader>
    <TableBody className="grid min-w-0 gap-4 md:table-row-group">
      {groups.map(group => {
        const lead = group.tools[0]
        if (lead === undefined) return null
        const model = toDirectoryToolCardModel(lead)
        const toolTitle = `${group.tools.length} ${group.tools.length === 1 ? 'Tool' : 'Tools'} in these results`
        return <TableRow key={group.provider} className="block min-w-0 rounded-card border border-border bg-card p-3 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0">
          <TableCell className="block min-w-0 whitespace-normal px-1 py-1 md:table-cell md:px-3 md:py-2.5">
                <div className="flex min-w-0 items-start gap-related">
                  <Avatar className="mt-0.5 size-8 rounded-lg border border-border/70 bg-muted/40">
                    {model.iconUrl === undefined ? null : <AvatarImage src={model.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
                    <AvatarFallback className="rounded-lg bg-transparent text-xs font-medium">{model.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium leading-snug"><Button variant="link" className="h-auto min-h-10 max-w-full break-all p-0 text-sm font-medium underline decoration-transparent underline-offset-4 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(group.provider)} aria-label={`View Tools from ${group.provider}`}>{group.provider}</Button></h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{model.title} · {model.accessLabel}</p>
                  </div>
                </div>
          </TableCell>
          <TableCell className="block whitespace-normal px-1 py-1 md:table-cell md:px-3 md:py-2.5 md:text-right"><p className="text-sm font-medium tabular-nums">{model.priceLabel}</p><p className="break-words text-xs text-muted-foreground">{model.priceContext}</p></TableCell>
          <TableCell className="block px-1 py-1 text-xs tabular-nums md:table-cell md:px-3 md:py-2.5 md:text-right" {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}><span className="md:hidden">Coinbase Bazaar calls · 30 days: </span>{model.callsLabel ?? '—'}</TableCell>
          <TableCell className="block px-1 py-1 text-xs tabular-nums md:table-cell md:px-3 md:py-2.5 md:text-right"><span className="md:hidden">Coinbase Bazaar payers · 30 days: </span>{model.payersLabel ?? '—'}</TableCell>
          <TableCell className="block px-1 py-1 text-xs tabular-nums md:table-cell md:px-3 md:py-2.5 md:text-right" title={toolTitle}><span className="md:hidden">Tools on this page: </span>{group.tools.length.toLocaleString('en-AU')}</TableCell>
        </TableRow>
      })}
    </TableBody>
  </Table>
}
