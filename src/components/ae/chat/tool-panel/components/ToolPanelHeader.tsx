// Invariant: header facts come only from the selected search option, following the existing chat card projection.
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { chatToolPanel, chatToolPanelHeading } from '@/lib/public/chat-ia'
import type { ToolPanelHeaderProps } from '../tool-panel.contracts'

export function ToolPanelHeader({ view, headingId, headingRef, onClose }: ToolPanelHeaderProps) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-3">
      <div className="grid min-w-0 gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 id={headingId} ref={headingRef} tabIndex={-1} className="min-w-0 break-words text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{chatToolPanelHeading(view.heading)}</h3>
          {view.bestMatch ? <Badge variant="secondary">{chatToolPanel.bestMatch}</Badge> : null}
        </div>
        {view.seller ? <p className="break-words text-sm text-muted-foreground">{view.seller}</p> : null}
        <p className="break-words text-sm"><ToolPriceText price={view.price} {...(view.priceValidUntil === undefined ? {} : { validUntil: view.priceValidUntil })} /></p>
        <p className="break-words text-sm text-muted-foreground">{view.readiness}</p>
      </div>
      <Button type="button" variant="ghost" className="min-h-touch shrink-0" onClick={onClose}>{chatToolPanel.cancel}</Button>
    </header>
  )
}
