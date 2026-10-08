import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'
import { AeComparisonTable } from '@/components/ae/shared/comparison-table/AeComparisonTable'
import type { ComparisonRow, ComparisonSection } from '@/components/ae/shared/comparison-table/comparison-table.contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { projectAdmittedListing } from '@/modules/registry/public'
import { projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { MARKET_LINK_STATE } from './market-return-context'

export type DirectoryComparisonProps = Readonly<{
  entries: readonly X402DirectoryEntry[]
  tools?: readonly PublicToolDescriptor[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}>

export function DirectoryComparison({ entries, tools = [], open, onOpenChange, onCloseAutoFocus }: DirectoryComparisonProps) {
  const [assessedAt] = useState(() => Date.now())
  const choices = [
    ...entries.map(entry => {
      const model = toDirectoryToolCardModel(entry)
      return { id: entry.resource, name: entry.title, provider: entry.provider,
        description: entry.description || 'Not published', category: entry.category ?? 'Not categorized',
        input: entry.schemaSummary ?? 'Inspect input contract', output: entry.outputSummary ?? 'Not published',
        access: model.accessLabel, price: model.priceLabel || 'Price unavailable', priceContext: model.priceContext,
        calls: entry.activity?.calls30d === undefined ? 'Not reported' : entry.activity.calls30d.toLocaleString('en-AU'),
        source: entry.provenance === undefined ? 'Metadata provenance not stated' : `${entry.provenance.directory} · Provider-published metadata`,
        action: <Link to="/tools/$providerHost/$slug" params={{ providerHost: directoryProviderKey(entry.provider), slug: entry.slug ?? directorySlugBase(entry.resource) }} state={MARKET_LINK_STATE}>Inspect Tool<ArrowUpRightIcon aria-hidden="true" size={14} /></Link> }
    }),
    ...tools.map(tool => {
      const view = projectToolObject(projectAdmittedListing(tool), undefined, assessedAt, undefined, tool.commercial.displayPrice)
      return { id: tool.toolRef, name: view.title, provider: tool.business.name, description: tool.summary,
        category: tool.contract.capabilityId, input: JSON.stringify(tool.contract.inputJsonSchema), output: JSON.stringify(tool.contract.outputJsonSchema),
        access: view.readiness.label, price: view.price?.label ?? 'Quote required', priceContext: 'Admitted Tool · a fresh Quote confirms the buyer price',
        calls: 'Not a Coinbase Bazaar activity claim', source: 'AE admitted Tool · published contract',
        action: <Link to="/tools/$toolRef" params={{ toolRef: tool.toolRef }} state={MARKET_LINK_STATE}>Inspect Tool<ArrowUpRightIcon aria-hidden="true" size={14} /></Link> }
    }),
  ]
  function fact(id: string, feature: string, value: (choice: typeof choices[number]) => string, retainWhenSame = false): ComparisonRow {
    return { id, feature, values: Object.fromEntries(choices.map(choice => [choice.id, value(choice)])), retainWhenSame }
  }
  const sections: readonly ComparisonSection[] = [
    { id: 'contribution', title: 'The contribution', rows: [
      fact('description', 'Description', choice => choice.description),
      fact('category', 'Category or capability', choice => choice.category),
      fact('provider', 'Provider or directory Host', choice => choice.provider, true),
    ] },
    { id: 'contract', title: 'What goes in. What comes back.', rows: [
      fact('input', 'Input needed', choice => choice.input), fact('output', 'Returns', choice => choice.output),
    ] },
    { id: 'commercial', title: 'Price and access', rows: [
      fact('access', 'Access', choice => choice.access, true), fact('price', 'Price', choice => choice.price, true),
      fact('price-source', 'Price context', choice => choice.priceContext, true),
    ] },
    { id: 'evidence', title: 'Source evidence', rows: [
      fact('calls', 'Coinbase Bazaar reported calls · 30 days', choice => choice.calls, true),
      fact('source', 'Listing source', choice => choice.source, true),
    ] },
  ]
  const columns = choices.map(choice => ({ id: choice.id, name: choice.name, caption: choice.provider, action: choice.action }))
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="arc-market arc-comparison-dialog flex max-h-[90dvh] w-[calc(100%-1.5rem)] min-w-0 flex-col overflow-hidden sm:max-w-6xl" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader className="pr-10">
        <DialogTitle>Compare Tools</DialogTitle>
        <DialogDescription>Published listing facts and current admitted Tool contracts. Admitted Tools require a fresh Quote; external listings have no AE Quote or Call.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {choices.length < 2 ? <p role="status" className="py-6 text-sm">Fewer than two selected Tools are available. Close comparison and choose another Tool.</p> : <AeComparisonTable columns={columns} sections={sections} />}
      </div>
    </DialogContent>
  </Dialog>
}
