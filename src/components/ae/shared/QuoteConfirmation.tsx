import { useId } from 'react'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { Button } from '@/components/arc/button/button'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'
import type { QuoteConfirmationView } from './object-family.contracts'

export type QuoteConfirmationProps = Readonly<{
  view: QuoteConfirmationView
  onApprove: (callRef: string) => void
  onDeny: (callRef: string) => void
  onFreshQuote: () => void
}>

export function QuoteConfirmation({ view, onApprove, onDeny, onFreshQuote }: QuoteConfirmationProps) {
  const priceUnavailable = view.quoteAmount.currency !== 'AUD' || view.remainingCap.amount.currency !== 'AUD'
  const headingId = useId()
  return (
    <DecisionPanel role="region" data-call-ref={view.callRef} aria-labelledby={headingId}>
      <header className="arc-decision-header">
        <h2 id={headingId} tabIndex={-1} className="arc-decision-heading">Confirm this Call</h2>
        <span className="arc-decision-status" data-tone={view.expired || priceUnavailable ? 'warning' : 'neutral'}>
          {view.expired ? 'Quote expired' : priceUnavailable ? 'AUD Quote unavailable' : 'Approval required'}
        </span>
      </header>
      <div className="arc-decision-body">
        <AeFactList className="arc-decision-facts" facts={[
          { label: 'Tool', value: view.toolName },
          { label: view.provider.kind === 'verified' ? 'Verified Provider' : 'Directory Host', value: view.provider.href
            ? <a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2" href={view.provider.href}>{view.provider.name}</a>
            : view.provider.name },
          { label: 'Quote', value: <span className="font-mono tabular-nums">{view.quoteAmount.units === '0' ? 'Free · ' : ''}{formatDisplayAmount(view.quoteAmount)} per Call</span> },
          { label: 'Expires', value: <time dateTime={new Date(view.expiresAt).toISOString()}>{formatUtcTimestamp(view.expiresAt)} UTC</time> },
          { label: 'Remaining cap after Call', value: <span className="font-mono tabular-nums">{formatDisplayAmount(view.remainingCap.amount)} · {view.remainingCap.window}</span> },
          { label: 'Input', value: view.inputSummary },
          { label: 'Call reference', value: <span className="break-all font-mono text-xs">{view.callRef}</span> },
          { label: 'Quote reference', value: <span className="break-all font-mono text-xs">{view.quoteRef}</span> },
          ...(view.quoteAmount.currency === 'AUD' ? [] : [{ label: 'Source amount', value: formatCurrencyAmount(view.quoteAmount) }]),
        ]} />
      </div>
      <div className="arc-decision-actions">
        {view.expired || priceUnavailable ? (
          <Button type="button" labelLayout="wrap" onClick={onFreshQuote}>Get a fresh Quote</Button>
        ) : (
          <Button type="button" labelLayout="wrap" disabled={view.pending} onClick={() => onApprove(view.callRef)}>Approve this Call</Button>
        )}
        <Button type="button" variant="secondary" labelLayout="wrap" disabled={view.pending} onClick={() => onDeny(view.callRef)}>Not now</Button>
      </div>
    </DecisionPanel>
  )
}
