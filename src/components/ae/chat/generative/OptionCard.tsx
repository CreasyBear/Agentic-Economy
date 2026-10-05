// Arc Pro product-listing TSX SHA-256: 45e258f3eb2a27dcf84d4cf1afc5b95cba17ac56f8888385c4524c706ecfd19c.
// Arc Pro product-listing media/quick/info composition; existing OptionView remains authoritative.
// Invariant: prices/attribution are projected facts, actions are controlled by the chat controller.
import { motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/arc/button/button'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { chatToolPanel } from '@/lib/public/chat-ia'
import { toolChoiceReadinessLabel } from '@/modules/chat/tool-card'
import type { OptionView } from './generative.contracts'
import '@/components/arc/market/ProductListing.css'
import '@/components/arc/chat/Options.css'

export type OptionCardProps = Readonly<{
  option: OptionView
  recommended: boolean
  compared: boolean
  selected: boolean
  multipleOptions: boolean
  selectionActions?: boolean
  onReview?: (toolRef: string) => void
  onSelect?: (id: string) => void
  onCompare?: (id: string) => void
  openToolRef?: string
  panelId?: string
  readOnly?: boolean
}>

export function OptionCard({ option, recommended, compared, selected, multipleOptions, selectionActions = true, onReview, onSelect, onCompare, openToolRef, panelId, readOnly = false }: OptionCardProps) {
  const location = `${option.host ?? ''}${option.resourcePath ?? ''}`
  const reduced = Boolean(useReducedMotion())
  return (
    <motion.article className="arc-market arc-chat arc-listing-card arc-chat-option" data-selected={selected || compared || undefined} data-recommended={recommended || undefined} layout={reduced ? false : 'position'} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}>
      <div className="arc-listing-media">
        <div className="arc-listing-preview">
          {recommended ? <span className="arc-chat-option-recommendation">{chatToolPanel.bestMatch}</span> : null}
          <h4 className="arc-chat-option-name"><a href={option.href}>{option.name}</a></h4>
          {option.outcome ? <p className="arc-chat-option-outcome">{option.outcome}</p> : null}
          {location.length > 0 ? <p title={location} className="arc-chat-option-location">{location}</p> : null}
          {option.networkLabel ? <p className="arc-listing-preview-label">{option.networkLabel}</p> : null}
        </div>
        {readOnly ? null : <div className="arc-listing-quick arc-chat-option-actions">
          {option.quoteable ? (
            <Button type="button" size="sm" disabled={onReview === undefined}
              onClick={() => onReview?.(option.id)} aria-expanded={openToolRef === option.id}
              {...(panelId === undefined || openToolRef !== option.id ? {} : { 'aria-controls': panelId })}>
              {chatToolPanel.review}
            </Button>
          ) : null}
          {selectionActions ? <>
            {!option.quoteable && onSelect !== undefined ? <Button type="button" size="sm" variant="secondary" onClick={() => onSelect(option.id)} disabled={!option.selectable}>Ask about this Tool</Button> : null}
            {multipleOptions && option.selectable ? <Button type="button" size="sm" variant="ghost" onClick={() => onCompare?.(option.id)} disabled={onCompare === undefined} aria-pressed={compared}>{compared ? 'Remove from compare' : 'Compare'}</Button> : null}
          </> : null}
        </div>}
      </div>
      <div className="arc-listing-info arc-chat-option-facts">
        <div className="arc-chat-option-price"><p className="arc-listing-price"><ToolPriceText price={option.price}
          {...(option.priceValidUntil === undefined ? {} : { validUntil: option.priceValidUntil })} /></p>
          {option.facts?.Price?.source ? <p className="arc-chat-option-attribution">{option.facts.Price.source}</p> : null}
          {option.providerListedPrice ? <p className="arc-listing-price-context" title={option.providerListedPrice}>Provider-listed price: {option.providerListedPrice}</p> : null}
        </div>
        {option.readiness === 'ready' ? <p className="arc-listing-access arc-chat-option-ready">
          <span aria-hidden="true" />
          {toolChoiceReadinessLabel(option.readiness)}
        </p> : <p className="arc-listing-access">{toolChoiceReadinessLabel(option.readiness)}</p>}
        {option.facts?.Readiness?.source ? <p className="arc-chat-option-attribution">{option.facts.Readiness.source}</p> : null}
        {option.usage ? <p className="arc-listing-facts">{option.usage}</p> : null}
        {option.facts?.Usage?.source ? <p className="arc-chat-option-attribution">{option.facts.Usage.source}</p> : null}
        {option.seller ? <p className="arc-listing-facts">{option.seller.kind === 'provider' ? 'Provider:' : 'Listed on'} {option.seller.name}</p> : null}
        {option.source ? <p className="arc-chat-option-attribution">{option.source}</p> : null}
      </div>
    </motion.article>
  )
}
