import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'
import { AeComparisonTable } from '@/components/ae/shared/comparison-table/AeComparisonTable'
import type { ComparisonRow, ComparisonSection } from '@/components/ae/shared/comparison-table/comparison-table.contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { MARKET_LINK_STATE } from './market-return-context'

export type DirectoryComparisonProps = Readonly<{
  entries: readonly X402DirectoryEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}>

export function DirectoryComparison({ entries, open, onOpenChange, onCloseAutoFocus }: DirectoryComparisonProps) {
  function fact(id: string, feature: string, value: (entry: X402DirectoryEntry) => string, retainWhenSame = false): ComparisonRow {
    return { id, feature, values: Object.fromEntries(entries.map(entry => [entry.resource, value(entry)])), retainWhenSame }
  }
  const sections: readonly ComparisonSection[] = [
    { id: 'contribution', title: 'The contribution', rows: [
      fact('description', 'Description', entry => entry.description || 'Not published'),
      fact('category', 'Category', entry => entry.category ?? 'Not categorized'),
      fact('provider', 'Provider', entry => entry.provider, true),
    ] },
    { id: 'contract', title: 'What goes in. What comes back.', rows: [
      fact('input', 'Input needed', entry => entry.schemaSummary ?? 'Inspect input contract'),
      fact('output', 'Returns', entry => entry.outputSummary ?? 'Not published'),
    ] },
    { id: 'commercial', title: 'Price and access', rows: [
      fact('access', 'Access', entry => toDirectoryToolCardModel(entry).accessLabel, true),
      fact('price', 'Price', entry => toDirectoryToolCardModel(entry).priceLabel || 'Price unavailable', true),
      fact('price-source', 'Price context', entry => toDirectoryToolCardModel(entry).priceContext, true),
    ] },
    { id: 'evidence', title: 'Source evidence', rows: [
      fact('calls', 'Coinbase Bazaar reported calls · 30 days', entry => entry.activity?.calls30d === undefined ? 'Not reported' : entry.activity.calls30d.toLocaleString('en-AU'), true),
      fact('source', 'Listing source', entry => entry.provenance === undefined ? 'Metadata provenance not stated' : `${entry.provenance.directory} · Provider-published metadata`, true),
    ] },
  ]
  const columns = entries.map(entry => ({
    id: entry.resource, name: entry.title, caption: entry.provider,
    action: <Link to="/tools/$providerHost/$slug" params={{ providerHost: directoryProviderKey(entry.provider), slug: entry.slug ?? directorySlugBase(entry.resource) }} state={MARKET_LINK_STATE}>Inspect Tool<ArrowUpRightIcon aria-hidden="true" size={14} /></Link>,
  }))
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="arc-market arc-comparison-dialog flex max-h-[90dvh] w-[calc(100%-1.5rem)] min-w-0 flex-col overflow-hidden sm:max-w-6xl" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader className="pr-10">
        <DialogTitle>Compare Tools</DialogTitle>
        <DialogDescription>Provider-listed prices and source activity. A Quote confirms the buyer&apos;s AUD price.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {entries.length < 2 ? <p role="status" className="py-6 text-sm">Fewer than two selected Tools are available. Close comparison and choose another Tool.</p> : <AeComparisonTable columns={columns} sections={sections} />}
      </div>
    </DialogContent>
  </Dialog>
}
