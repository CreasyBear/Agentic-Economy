import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { MARKET_LINK_STATE } from './market-return-context'

const rows: readonly Readonly<{ label: string; value: (entry: X402DirectoryEntry) => string }>[] = [
  { label: 'Category', value: entry => entry.category ?? 'Not categorized' },
  { label: 'Provider', value: entry => entry.provider },
  { label: 'Description', value: entry => entry.description || 'Not published' },
  { label: 'Provider-listed price', value: entry => [...new Set(entry.prices.map(price => price.amount))].join(' / ') || 'Price on request' },
  { label: 'Input needed', value: entry => entry.schemaSummary ?? 'Inspect input contract' },
  { label: 'Returns', value: entry => entry.outputSummary ?? 'Not published' },
  { label: 'Recent use', value: entry => entry.activity?.calls30d === undefined ? 'Not reported' : `${entry.activity.calls30d.toLocaleString()} Calls in 30 days` },
]

export function DirectoryComparison({ entries, open, onOpenChange, onCloseAutoFocus }: Readonly<{
  entries: readonly X402DirectoryEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}>) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="grid max-h-[85dvh] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden sm:max-w-5xl" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader className="pr-8">
        <DialogTitle>Compare Tools</DialogTitle>
        <DialogDescription><strong className="font-medium text-foreground">Preliminary comparison.</strong> Published Provider facts only. Inspect a Tool for its availability, data use and effects; your Agent’s Quote confirms the exact buyer AUD price and spending checks.</DialogDescription>
      </DialogHeader>
      <p className="text-xs text-muted-foreground sm:hidden">Swipe sideways to see each Tool.</p>
      <Table containerClassName="min-h-0 overflow-auto">
        <TableHeader><TableRow><TableHead className="sticky left-0 top-0 z-30 min-w-36 bg-popover font-sans normal-case tracking-normal">Fact</TableHead>{entries.map(entry => <TableHead key={entry.resource} className="sticky top-0 z-20 min-w-56 max-w-72 whitespace-normal bg-popover py-4 font-sans text-sm normal-case tracking-normal"><div className="grid gap-intra"><span>{entry.title}</span><Button asChild size="sm" variant="outline" className="w-fit"><Link to="/tools/$providerHost/$slug" params={{ providerHost: directoryProviderKey(entry.provider), slug: entry.slug ?? directorySlugBase(entry.resource) }} state={MARKET_LINK_STATE}>Inspect Tool</Link></Button></div></TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map(row => <TableRow key={row.label}><TableCell className="sticky left-0 z-10 bg-popover align-top font-medium">{row.label}</TableCell>{entries.map(entry => <TableCell key={entry.resource} className="max-w-72 whitespace-normal break-words align-top text-muted-foreground">{row.value(entry)}</TableCell>)}</TableRow>)}
        </TableBody>
      </Table>
    </DialogContent>
  </Dialog>
}
