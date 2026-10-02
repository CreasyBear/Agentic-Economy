import type { OptionsGridProps } from './generative.contracts'
import { OptionCard } from './OptionCard'

export function OptionsGrid({ view, onSelect, onCompare, onReview, openToolRef, panelId, readOnly = false }: OptionsGridProps) {
  if (view.options.length === 0) return null
  return (
    <section aria-label="Options" className="grid min-w-0 gap-3">
      <h3 className="text-xs font-medium text-muted-foreground sm:text-[0.8125rem]">Options</h3>
      <div className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible">
        {view.options.map((option) => (
          <OptionCard key={option.id} option={option}
            recommended={view.recommendedId === option.id}
            compared={view.comparedIds.includes(option.id)}
            selected={view.selectedId === option.id}
            multipleOptions={view.options.length > 1}
            readOnly={readOnly}
            {...(onSelect === undefined ? {} : { onSelect })}
            {...(onCompare === undefined ? {} : { onCompare })}
            {...(onReview === undefined ? {} : { onReview })}
            {...(openToolRef === undefined ? {} : { openToolRef })}
            {...(panelId === undefined ? {} : { panelId })}
          />
        ))}
      </div>
    </section>
  )
}
