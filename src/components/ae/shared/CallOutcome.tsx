import { AeFactList } from '@/components/ae/data/AeFactList'
import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import { formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'
import type { CallOutcomeView } from './object-family.contracts'

export type CallOutcomeProps = Readonly<{ view: CallOutcomeView }>

export function CallOutcome({ view }: CallOutcomeProps) {
  return (
    <DecisionPanel role="region" aria-label="Call outcome">
      <header className="arc-decision-header">
        <h2 className="arc-decision-heading" tabIndex={-1}>Call outcome</h2>
        <span className="arc-decision-status" data-tone={view.purchaseKind === 'delivered' || view.purchaseKind === 'refunded'
          ? 'success' : view.purchaseKind === 'uncertain' ? 'warning' : 'neutral'}>{view.label}</span>
      </header>
      <div className="arc-decision-body">
        <p className="text-sm text-muted-foreground">{view.detail}</p>
        <AeFactList className="arc-decision-facts" facts={[
          { label: 'Delivery', value: view.delivery },
          { label: 'Payment', value: view.payment },
          ...(view.amount === undefined ? [] : [
            { label: view.amountLabel ?? 'Amount', value: <span className="font-mono tabular-nums">{formatDisplayAmount(view.amount)}</span> },
            { label: 'Exact amount', value: formatCurrencyAmount(view.amount) },
          ]),
          { label: 'Call reference', value: <span className="break-all font-mono text-xs">{view.callRef}</span> },
        ]} />
      </div>
      <div className="arc-decision-actions">
        {view.receiptHref === undefined ? null : (
          <a href={view.receiptHref} className="arc-decision-link">View Call receipt</a>
        )}
        <a href="/trust" target="_blank" rel="noreferrer" aria-label="Trust centre (opens in a new tab)"
          className="arc-decision-link">Trust centre</a>
      </div>
    </DecisionPanel>
  )
}
