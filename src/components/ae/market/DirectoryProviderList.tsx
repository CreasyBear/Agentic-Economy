import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { directoryVolumeLabel, groupDirectoryProviders, toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

export type DirectoryProviderListProps = Readonly<{
  entries: readonly X402DirectoryEntry[]
  onSelect: (provider: string) => void
  volumeByPayTo?: Readonly<Record<string, string>>
}>

/** One row per host, in the same order as the Tool list. Price, calls, payers, and volume are the first Tool in that order. */
export function DirectoryProviderList({ entries, onSelect, volumeByPayTo = {} }: DirectoryProviderListProps) {
  const groups = groupDirectoryProviders(entries)
  return (
    <Table aria-label="Providers">
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-64">Provider</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Calls</TableHead>
          <TableHead className="text-right">Payers</TableHead>
          <TableHead className="text-right">Volume</TableHead>
          <TableHead className="text-right">Tools</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map(group => {
          const lead = group.tools[0]
          if (lead === undefined) return null
          const model = toDirectoryToolCardModel(lead)
          const toolTitle = `${group.tools.length} ${group.tools.length === 1 ? 'Tool' : 'Tools'} in these results`
          return (
            <TableRow key={group.provider}>
              <TableCell className="whitespace-normal">
                <div className="flex min-w-0 items-start gap-related">
                  <Avatar className="mt-0.5 size-8 rounded-lg border border-border/70 bg-muted/40">
                    {model.iconUrl === undefined ? null : <AvatarImage src={model.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
                    <AvatarFallback className="rounded-lg bg-transparent text-xs font-medium">{model.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium leading-snug">
                      <Button variant="link" className="h-auto p-0 text-sm font-medium underline decoration-transparent underline-offset-4 transition-[color,text-decoration-color] duration-fast ease-standard hover:decoration-foreground active:scale-100" onClick={() => onSelect(group.provider)} aria-label={`View Tools from ${group.provider}`}>{group.provider}</Button>
                    </h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{model.title}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <p className="text-sm font-medium tabular-nums">{model.priceLabel}</p>
                <p className="text-xs text-muted-foreground">{model.priceContext}</p>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums" {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}>
                {model.callsLabel ?? '—'}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">{model.payersLabel ?? '—'}</TableCell>
              <TableCell className="text-right text-sm tabular-nums" title="Settled Base USDC to this payee over 30 days. Tools that share a payee repeat one number.">
                {directoryVolumeLabel(lead, volumeByPayTo)}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums" title={toolTitle}>{group.tools.length.toLocaleString('en-AU')}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
