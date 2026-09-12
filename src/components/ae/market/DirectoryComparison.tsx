import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { MARKET_LINK_STATE } from './market-return-context'

const rows: readonly Readonly<{ label: string; value: (entry: X402DirectoryEntry) => string }>[] = [
  { label: 'Provider hostname', value: entry => entry.provider },
  { label: 'Description', value: entry => entry.description || 'Not published' },
  { label: 'Published price', value: entry => [...new Set(entry.prices.map(price => price.amount))].join(' / ') || 'Price on request' },
  { label: 'Network', value: entry => [...new Set(entry.prices.map(price => price.networkLabel ?? price.network))].join(', ') || 'Not published' },
  { label: 'Inputs', value: entry => entry.schemaSummary ?? 'Inspect input contract' },
  { label: 'Output', value: entry => entry.outputSummary ?? 'Not published' },
  { label: 'Calls in 30 days', value: entry => entry.activity?.calls30d?.toLocaleString() ?? 'Not reported' },
]

export function DirectoryComparison({ entries, open, onOpenChange, onCloseAutoFocus }: Readonly<{
  entries: readonly X402DirectoryEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}>) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-5xl" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader className="pr-8">
        <DialogTitle>Compare Tools</DialogTitle>
        <DialogDescription>Published directory information. The Quote confirms the price and spending checks for your request.</DialogDescription>
      </DialogHeader>
      <p className="text-xs text-muted-foreground sm:hidden">Swipe sideways to see each Tool.</p>
      <Table>
        <TableHeader><TableRow><TableHead className="min-w-36 font-sans normal-case tracking-normal">Tool</TableHead>{entries.map(entry => <TableHead key={entry.resource} className="min-w-56 max-w-72 whitespace-normal py-4 font-sans text-sm normal-case tracking-normal">{entry.title}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map(row => <TableRow key={row.label}><TableCell className="align-top font-medium">{row.label}</TableCell>{entries.map(entry => <TableCell key={entry.resource} className="max-w-72 whitespace-normal break-words align-top text-muted-foreground">{row.value(entry)}</TableCell>)}</TableRow>)}
          <TableRow><TableCell />{entries.map(entry => <TableCell key={entry.resource}><Button asChild variant="outline"><Link to="/tools/$providerHost/$slug" params={{ providerHost: directoryProviderKey(entry.provider), slug: entry.slug ?? directorySlugBase(entry.resource) }} state={MARKET_LINK_STATE}>Inspect Tool</Link></Button></TableCell>)}</TableRow>
        </TableBody>
      </Table>
    </DialogContent>
  </Dialog>
}
