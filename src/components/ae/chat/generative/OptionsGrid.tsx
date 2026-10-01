import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { chatToolPanel } from '@/lib/public/chat-ia'
import { toolChoiceReadinessLabel } from '@/modules/chat/tool-card'
import type { OptionsGridProps } from './generative.contracts'

export function OptionsGrid({ view, onSelect, onCompare, onReview, openToolRef, panelId, readOnly = false }: OptionsGridProps) {
  if (view.options.length === 0) return null
  return (
    <section aria-label="Options" className="grid min-w-0 gap-3">
      <h3 className="text-xs font-medium text-muted-foreground sm:text-[0.8125rem]">Options</h3>
      <div className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible">
        {view.options.map((option) => {
          const compared = view.comparedIds.includes(option.id)
          const recommended = view.recommendedId === option.id
          return (
            <article key={option.id} className={`flex min-w-0 w-60 shrink-0 snap-start flex-col gap-2 rounded-card bg-muted p-3 transition-[background-color,box-shadow] duration-fast ease-standard motion-reduce:transition-none hover:bg-muted/70 sm:w-auto sm:gap-3 ${recommended ? 'ring-1 ring-ring' : ''}`}>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h4 className="min-w-0 break-words text-sm font-semibold sm:text-[0.9375rem]"><a href={option.href} className="break-words underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{option.name}</a></h4>
                  {recommended ? <Badge variant="secondary">{chatToolPanel.bestMatch}</Badge> : null}
                </div>
                {option.outcome ? <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground sm:text-[0.8125rem]">{option.outcome}</p> : null}
              </div>
              <div className="mt-auto grid min-w-0 gap-1 text-xs sm:text-[0.8125rem]">
                {option.price === 'Price to be confirmed' ? null : <p className="break-words tabular-nums"><ToolPriceText price={option.price}
                  {...(option.priceValidUntil === undefined ? {} : { validUntil: option.priceValidUntil })} /></p>}
                {option.readiness === 'ready' ? <p className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                  {toolChoiceReadinessLabel(option.readiness)}
                </p> : null}
                {option.usage ? <p className="break-words text-muted-foreground">{option.usage}</p> : null}
                {option.seller ? <p className="break-words text-muted-foreground">{option.seller.kind === 'provider' ? 'Provider:' : 'Listed on'} {option.seller.name}</p> : null}
              </div>
              {readOnly ? null : <div className="flex min-w-0 flex-wrap gap-2">
                {option.quoteable ? (
                  <Button type="button" size="sm" className="min-h-10" disabled={onReview === undefined}
                    onClick={() => onReview?.(option.id)} aria-expanded={openToolRef === option.id}
                    {...(panelId === undefined || openToolRef !== option.id ? {} : { 'aria-controls': panelId })}>
                    {chatToolPanel.review}
                  </Button>
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
