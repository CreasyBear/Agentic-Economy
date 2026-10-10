import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'
import { AeComparisonTable } from '@/components/ae/shared/comparison-table/AeComparisonTable'
import type { ComparisonRow, ComparisonSection } from '@/components/ae/shared/comparison-table/comparison-table.contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PRICE_UNAVAILABLE, toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import { jsonSchemaFieldSummary } from '@/modules/market/x402-directory-projection'
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
        description: entry.description || 'Not listed', category: entry.category ?? 'Not listed',
        input: entry.schemaSummary ?? 'See the tool page', output: entry.outputSummary ?? 'Not listed',
        access: model.accessLabel, price: model.priceLabel || PRICE_UNAVAILABLE, priceContext: model.priceContext,
        calls: entry.activity?.calls30d === undefined ? 'Not reported' : entry.activity.calls30d.toLocaleString('en-AU'),
        source: entry.provenance === undefined ? 'Not stated' : `${entry.provenance.directory}, as the provider describes it`,
        action: <Link to="/tools/$providerHost/$slug" params={{ providerHost: directoryProviderKey(entry.provider), slug: entry.slug ?? directorySlugBase(entry.resource) }} state={MARKET_LINK_STATE}>View tool<ArrowUpRightIcon aria-hidden="true" size={14} /></Link> }
    }),
    ...tools.map(tool => {
      const view = projectToolObject(projectAdmittedListing(tool), undefined, assessedAt, undefined, tool.commercial.displayPrice)
      return { id: tool.toolRef, name: view.title, provider: tool.business.name, description: tool.summary,
        category: tool.contract.capabilityId, input: jsonSchemaFieldSummary(tool.contract.inputJsonSchema, 'Inputs') ?? 'See the tool page', output: jsonSchemaFieldSummary(tool.contract.outputJsonSchema, 'Returns') ?? 'See the tool page',
        access: view.readiness.label, price: view.price?.label ?? 'Quote required', priceContext: 'A quote confirms the price before each call',
        calls: 'Not reported', source: 'Listed on aecon',
        action: <Link to="/tools/$toolRef" params={{ toolRef: tool.toolRef }} state={MARKET_LINK_STATE}>View tool<ArrowUpRightIcon aria-hidden="true" size={14} /></Link> }
    }),
  ]
  function fact(id: string, feature: string, value: (choice: typeof choices[number]) => string, retainWhenSame = false): ComparisonRow {
    return { id, feature, values: Object.fromEntries(choices.map(choice => [choice.id, value(choice)])), retainWhenSame }
  }
  const sections: readonly ComparisonSection[] = [
    { id: 'contribution', title: 'What it does', rows: [
      fact('description', 'Description', choice => choice.description),
      fact('category', 'Category', choice => choice.category),
      fact('provider', 'Provider', choice => choice.provider, true),
    ] },
    { id: 'contract', title: 'What goes in. What comes back.', rows: [
      fact('input', 'Input needed', choice => choice.input), fact('output', 'Returns', choice => choice.output),
    ] },
    { id: 'commercial', title: 'Price and access', rows: [
      fact('access', 'Access', choice => choice.access, true), fact('price', 'Price', choice => choice.price, true),
      fact('price-source', 'Price context', choice => choice.priceContext, true),
    ] },
    { id: 'evidence', title: 'Usage and source', rows: [
      fact('calls', 'Calls, last 30 days', choice => choice.calls, true),
      fact('source', 'Listing source', choice => choice.source, true),
    ] },
  ]
  const columns = choices.map(choice => ({ id: choice.id, name: choice.name, caption: choice.provider, action: choice.action }))
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="arc-market arc-comparison-dialog flex max-h-[90dvh] w-[calc(100%-1.5rem)] min-w-0 flex-col overflow-hidden sm:max-w-6xl" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader className="pr-10">
        <DialogTitle>Compare tools</DialogTitle>
        <DialogDescription>Listing facts side by side. Tools that are ready to call show a quote before each call.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {choices.length < 2 ? <p role="status" className="py-6 text-sm">Pick at least two tools to compare.</p> : <AeComparisonTable columns={columns} sections={sections} />}
      </div>
    </DialogContent>
  </Dialog>
}
