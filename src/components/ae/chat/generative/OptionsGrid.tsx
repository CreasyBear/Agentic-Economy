import type { OptionsGridProps } from './generative.contracts'
import { OptionCard } from './OptionCard'
import { ProductListing } from '@/components/arc/market/ProductListing'
import '@/components/arc/chat/Options.css'

export function OptionsGrid({ view, onSelect, onCompare, onReview, openToolRef, panelId, readOnly = false }: OptionsGridProps) {
  if (view.options.length === 0) return null
  return (
    <section aria-label="Options" className="arc-market arc-chat arc-chat-options">
      <h3 className="arc-chat-options-title">Options</h3>
      <ProductListing className="arc-chat-option-gallery">
        {view.options.map((option) => (
          <li key={option.id}><OptionCard option={option}
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
          /></li>
        ))}
      </ProductListing>
    </section>
  )
}
