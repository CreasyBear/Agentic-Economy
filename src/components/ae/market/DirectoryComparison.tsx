import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { MARKET_LINK_STATE } from './market-return-context'

const comparisonFacts = [
  { label: 'Category', value: (entry: X402DirectoryEntry) => entry.category ?? 'Not categorized' },
  { label: 'Provider', value: (entry: X402DirectoryEntry) => entry.provider },
  { label: 'Description', value: (entry: X402DirectoryEntry) => entry.description || 'Not published' },
  { label: 'Input needed', value: (entry: X402DirectoryEntry) => entry.schemaSummary ?? 'Inspect input contract' },
  { label: 'Returns', value: (entry: X402DirectoryEntry) => entry.outputSummary ?? 'Not published' },
] as const

export type DirectoryComparisonProps = Readonly<{
  entries: readonly X402DirectoryEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}>

export function DirectoryComparison({ entries, open, onOpenChange, onCloseAutoFocus }: DirectoryComparisonProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] min-w-0 flex-col overflow-hidden sm:max-w-5xl" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader className="pr-8">
        <DialogTitle>Compare Tools</DialogTitle>
        <DialogDescription>Compare Provider-listed prices and Coinbase Bazaar activity. Inspect each Tool before calling; a Quote confirms the buyer&apos;s AUD price.</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 gap-4 overflow-y-auto sm:grid-cols-2">
        {entries.map(entry => {
          const model = toDirectoryToolCardModel(entry)
          return <article key={entry.resource} className="min-w-0 rounded-card border border-border p-4">
            <h3 className="break-words text-base font-medium">{entry.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{entry.provider}</p>
            <p className="mt-1 text-xs font-medium">{model.accessLabel}</p>
            <p className="mt-3 text-sm font-medium tabular-nums">{model.priceLabel}</p>
            <p className="text-xs text-muted-foreground">{model.priceContext}</p>
            <dl className="mt-4 grid gap-3">
              {comparisonFacts.map(fact => <div key={fact.label} className="min-w-0 border-t border-border pt-2">
                <dt className="text-xs font-medium text-foreground">{fact.label}</dt>
                <dd className="break-words text-sm text-muted-foreground">{fact.value(entry)}</dd>
              </div>)}
              {entry.activity?.calls30d === undefined ? null : <div className="min-w-0 border-t border-border pt-2">
                <dt className="text-xs font-medium text-foreground">Coinbase Bazaar reported calls · 30 days</dt>
                <dd className="text-sm tabular-nums text-muted-foreground">{entry.activity.calls30d.toLocaleString('en-AU')}</dd>
              </div>}
            </dl>
            <Link to="/tools/$providerHost/$slug" params={{ providerHost: directoryProviderKey(entry.provider), slug: entry.slug ?? directorySlugBase(entry.resource) }} state={MARKET_LINK_STATE} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'mt-4 min-h-10')}>Inspect Tool</Link>
          </article>
        })}
      </div>
    </DialogContent>
  </Dialog>
}
