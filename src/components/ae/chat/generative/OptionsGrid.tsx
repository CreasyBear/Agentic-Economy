import { Button } from '@/components/ui/button'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { OptionsGridProps } from './generative.contracts'

export function OptionsGrid({ view, onSelect, onCompare }: OptionsGridProps) {
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
                <p className="tabular-nums">{option.price}</p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden="true" className={option.readiness === 'ready' ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-warning'} />
                  {option.readiness === 'ready' ? 'Ready to use' : option.readiness === 'unavailable' ? getStatusPresentation('unavailable').label : 'Not yet verified'}
                </p>
                {option.usage ? <p className="line-clamp-2 text-muted-foreground">{option.usage}</p> : null}
                {option.seller ? <p className="truncate text-muted-foreground">{option.seller.kind === 'provider' ? 'Sold by' : 'Listed on'} {option.seller.name}</p> : null}
                {!option.selectable ? <p className="text-muted-foreground">View listing; not available to buy through AE</p> : null}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="secondary" className="min-h-10" onClick={() => onSelect(option.id)} disabled={!option.selectable} aria-pressed={view.selectedId === option.id}>Select</Button>
                {view.options.length < 2 || !option.selectable ? null : <Button type="button" size="sm" variant="secondary" className="min-h-10" onClick={() => onCompare(option.id)} aria-pressed={compared}>{compared ? 'Remove from compare' : 'Compare'}</Button>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
