import { Button } from '@/components/ui/button'
import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { toolChoiceReadinessLabel } from '@/modules/chat/tool-card'
import type { OptionsGridProps as GenerativeOptionsGridProps } from './generative.contracts'

type OptionsGridProps = GenerativeOptionsGridProps & Readonly<{
  ownerChatEnabled?: boolean
  onRunTool?: (toolRef: string, title: string) => void
  onAddCredit?: (shortfall?: { units: string; exponent: number } | undefined, run?: { toolRef: string; title: string }) => void
}>

export function OptionsGrid({ view, onSelect, onCompare, onQuoteSelect, signedIn, ownerChatEnabled = false, onRunTool, onAddCredit, readOnly = false }: OptionsGridProps) {
  if (view.options.length === 0) return null
  return (
    <section aria-label="Options" className="grid min-w-0 gap-3">
      <h3 className="text-xs font-medium text-muted-foreground sm:text-[0.8125rem]">Options</h3>
      <div className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible">
        {view.options.map((option) => {
          const compared = view.comparedIds.includes(option.id)
          return (
            <article key={option.id} className="flex w-60 shrink-0 snap-start flex-col gap-2 rounded-card bg-muted p-3 transition-colors duration-fast hover:bg-muted/70 sm:w-auto sm:gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold sm:text-[0.9375rem]"><a href={option.href} className="break-words underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{option.name}</a></h4>
                {option.outcome ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-[0.8125rem]">{option.outcome}</p> : null}
              </div>
              <div className="mt-auto grid gap-1 text-xs sm:text-[0.8125rem]">
                {option.price === 'Price to be confirmed' ? null : <p className="tabular-nums"><ToolPriceText price={option.price}
                  {...(option.priceValidUntil === undefined ? {} : { validUntil: option.priceValidUntil })} /></p>}
                {option.readiness === 'ready' ? <p className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                  {toolChoiceReadinessLabel(option.readiness)}
                </p> : null}
                {option.usage ? <p className="line-clamp-2 text-muted-foreground">{option.usage}</p> : null}
                {option.seller ? <p className="truncate text-muted-foreground">{option.seller.kind === 'provider' ? 'Sold by' : 'Listed on'} {option.seller.name}</p> : null}
              </div>
              {readOnly ? null : <div className="flex flex-wrap gap-1">
                {option.quoteable ? (
                  <>
                    <Button type="button" size="sm" className="min-h-10" disabled={ownerChatEnabled ? onRunTool === undefined : onAddCredit === undefined}
                      onClick={() => ownerChatEnabled ? onRunTool?.(option.id, option.name) : onAddCredit?.(undefined, { toolRef: option.id, title: option.name })}>
                      {option.price === 'Price to be confirmed' ? 'Run' : <>Run · <ToolPriceText price={option.price}
                        {...(option.priceValidUntil === undefined ? {} : { validUntil: option.priceValidUntil })} /></>}
                    </Button>
                    {onQuoteSelect && signedIn
                      ? <Button type="button" size="sm" variant="ghost" className="min-h-10 px-2 text-muted-foreground underline underline-offset-4" onClick={() => onQuoteSelect(option.id)}>Edit input</Button>
                      : null}
                  </>
                ) : null}
                <Button type="button" size="sm" variant="secondary" className="min-h-10" onClick={() => onSelect?.(option.id)} disabled={!option.selectable} aria-pressed={view.selectedId === option.id}>Select</Button>
                {view.options.length < 2 || !option.selectable ? null : <Button type="button" size="sm" variant="secondary" className="min-h-10" onClick={() => onCompare?.(option.id)} aria-pressed={compared}>{compared ? 'Remove from compare' : 'Compare'}</Button>}
              </div>}
            </article>
          )
        })}
      </div>
    </section>
  )
}
