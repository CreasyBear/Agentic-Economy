// Invariant: header facts come only from the selected search option, following the existing chat card projection.
import { Button } from '@/components/arc/button/button'
import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { chatToolPanel, chatToolPanelHeading } from '@/lib/public/chat-ia'
import type { ToolPanelHeaderProps } from '../tool-panel.contracts'

export function ToolPanelHeader({ view, headingId, headingRef, onClose }: ToolPanelHeaderProps) {
  return (
    <header className="arc-decision-header">
      <div className="arc-decision-heading-group">
        <div className="arc-decision-heading-row">
          <h3 id={headingId} ref={headingRef} tabIndex={-1} className="arc-decision-heading">{chatToolPanelHeading(view.heading)}</h3>
          {view.bestMatch ? <span className="arc-decision-status">{chatToolPanel.bestMatch}</span> : null}
        </div>
        {view.seller ? <p className="break-words text-sm text-muted-foreground">{view.seller}</p> : null}
        <p className="break-words text-sm"><ToolPriceText price={view.price} {...(view.priceValidUntil === undefined ? {} : { validUntil: view.priceValidUntil })} /></p>
        <p className="break-words text-sm text-muted-foreground">{view.readiness}</p>
      </div>
      <Button type="button" variant="ghost" className="min-h-touch shrink-0" onClick={onClose}>{chatToolPanel.cancel}</Button>
    </header>
  )
}
