// Invariant: the Run button exposes charge timing and explicit submission state, following truthful chat purchase disclosures.
import { Button } from '@/components/ui/button'
import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { chatToolPanel } from '@/lib/public/chat-ia'
import type { ToolPanelActionsProps } from '../tool-panel.contracts'

export function ToolPanelActions({ view, statusId, onRun, onRunAgain }: ToolPanelActionsProps) {
  return (
    <div aria-busy={view.submission === 'submitting'} className="grid min-w-0 gap-2">
      {view.incomplete === undefined ? null : <p id={statusId} role="status" className="break-words text-sm text-muted-foreground">{view.incomplete}</p>}
      {view.disabledReason === undefined ? null : <p role="status" className="break-words text-sm text-muted-foreground">{view.disabledReason}</p>}
      {view.runFailure === undefined ? null : <p role="status" className="break-words text-sm text-muted-foreground">
        {view.runFailure === 'not_sent' ? chatToolPanel.runNotSent : chatToolPanel.runOutcomeUnknown}
      </p>}
      {view.submission === 'outcome_unknown' ? null : view.submission === 'submitted' ? (
        <>
          <p role="status" className="break-words text-sm text-muted-foreground">{chatToolPanel.submitted}</p>
          <Button type="button" className="min-h-touch w-full max-w-full" onClick={onRunAgain}>{chatToolPanel.runAgain}</Button>
        </>
      ) : (
        <Button type="button" className="min-h-touch w-full max-w-full min-w-0 justify-center whitespace-normal text-center leading-snug"
          disabled={!view.canRun} aria-busy={view.submission === 'submitting'} onClick={onRun}>
          {view.submission === 'submitting' ? chatToolPanel.submitting : (
            <span className="min-w-0 break-words">
              {chatToolPanel.run}{view.price === 'Price to be confirmed' ? null : <> · <ToolPriceText price={view.price}
                {...(view.priceValidUntil === undefined ? {} : { validUntil: view.priceValidUntil })} /></>}
            </span>
          )}
        </Button>
      )}
      <p className="break-words text-sm text-muted-foreground">{view.consequence}</p>
      <p className="break-words text-sm text-muted-foreground">{view.priceNote}</p>
      {view.disclosure === undefined ? null : <p className="break-words text-sm text-muted-foreground">{view.disclosure}</p>}
    </div>
  )
}
