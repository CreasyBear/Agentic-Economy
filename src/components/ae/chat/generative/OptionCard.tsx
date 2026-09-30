// Invariant: one search result has one trusted presentation; extracted unchanged from OptionsGrid.tsx.
import { truncateText } from '@/modules/common/truncate-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { chatToolPanel } from '@/lib/public/chat-ia'
import { toolChoiceReadinessLabel } from '@/modules/chat/tool-card'
import type { OptionView } from './generative.contracts'

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
  return (
    <article className={`flex min-w-0 w-60 shrink-0 snap-start flex-col gap-2 rounded-card bg-muted p-3 transition-[background-color,box-shadow] duration-fast ease-standard motion-reduce:transition-none hover:bg-muted/70 sm:w-auto sm:gap-3 ${recommended ? 'ring-1 ring-ring' : ''}`}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h4 className="min-w-0 break-words text-sm font-semibold sm:text-[0.9375rem]"><a href={option.href} className="break-words underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{option.name}</a></h4>
          {recommended ? <Badge variant="secondary">{chatToolPanel.bestMatch}</Badge> : null}
        </div>
        {option.outcome ? <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground sm:text-[0.8125rem]">{option.outcome}</p> : null}
        {location.length > 0 ? <p title={location} className="min-w-0 truncate text-xs text-muted-foreground">{truncateText(location, 120)}</p> : null}
      </div>
      <div className="mt-auto grid min-w-0 gap-1 text-xs sm:text-[0.8125rem]">
        {option.price === 'Price to be confirmed' ? null : <p className="break-words tabular-nums"><ToolPriceText price={option.price}
          {...(option.priceValidUntil === undefined ? {} : { validUntil: option.priceValidUntil })} /></p>}
        {option.providerListedPrice ? <p className="min-w-0 truncate text-muted-foreground">Provider-listed price: {truncateText(option.providerListedPrice, 80)}</p> : null}
        {option.networkLabel ? <p className="min-w-0 truncate text-muted-foreground">{truncateText(option.networkLabel, 48)}</p> : null}
        {option.readiness === 'ready' ? <p className="flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          {toolChoiceReadinessLabel(option.readiness)}
        </p> : <p className="min-w-0 truncate text-muted-foreground">{toolChoiceReadinessLabel(option.readiness)}</p>}
        {option.usage ? <p className="break-words text-muted-foreground">{option.usage}</p> : null}
        {option.seller ? <p className="break-words text-muted-foreground">{option.seller.kind === 'provider' ? 'Sold by' : 'Listed on'} {option.seller.name}</p> : null}
      </div>
      {readOnly ? null : <div className="flex min-w-0 flex-wrap gap-2">
        {option.quoteable ? (
          <Button type="button" size="sm" className="min-h-10" disabled={onReview === undefined}
            onClick={() => onReview?.(option.id)} aria-expanded={openToolRef === option.id}
            {...(panelId === undefined || openToolRef !== option.id ? {} : { 'aria-controls': panelId })}>
            {chatToolPanel.review}
          </Button>
        ) : null}
        {selectionActions ? <>
          <Button type="button" size="sm" variant="secondary" className="min-h-10" onClick={() => onSelect?.(option.id)} disabled={!option.selectable} aria-pressed={selected}>Select</Button>
          {multipleOptions && option.selectable ? <Button type="button" size="sm" variant="secondary" className="min-h-10" onClick={() => onCompare?.(option.id)} aria-pressed={compared}>{compared ? 'Remove from compare' : 'Compare'}</Button> : null}
        </> : null}
      </div>}
    </article>
  )
}
