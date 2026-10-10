import { Button } from '@/components/arc/button/button'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatDisplayAmount } from '@/modules/money/public'
import type { AddCreditPanelProps } from '../add-credit.contracts'
import '@/components/ae/console/FundingComposition.css'

export function AddCreditPanel({
  signedIn,
  payingOn,
  enableBusy,
  onEnablePaying,
  signInHref,
  selected,
  onSelect,
  onBegin,
  busy,
  paymentStatus,
  onCheckPayment,
  problem,
  balance,
  constraints,
  shortfallTooLarge,
}: AddCreditPanelProps) {
  const waitingForCredit = paymentStatus !== 'idle'

  if (!signedIn) {
    return (
      <div className="arc-market arc-funding-quick">
        <p>Sign in to get answers that cost a few cents.</p>
        <a className="arc-funding-link" href={signInHref}>Continue</a>
      </div>
    )
  }

  if (!payingOn && !waitingForCredit) {
    return (
      <div className="arc-market arc-funding-quick">
        <p>Let aecon spend up to A$1 per answer and A$5 a day for you. Every charge shows under the answer.</p>
        <Button type="button" className="arc-funding-action" disabled={enableBusy} onClick={onEnablePaying}>
          {enableBusy ? 'Turning on…' : 'Turn on'}
        </Button>
      </div>
    )
  }

  return (
    <div className="arc-market arc-funding-quick">
      {balance === null ? null : (
        <div className="arc-funding-balance">
          <p>Available balance: {formatDisplayAmount(balance.totalBalance ?? balance.balance)}</p>
          {balance.promotionalBalance === undefined ? null : (
            <>
              <p>Purchased credit: {formatDisplayAmount(balance.balance)}</p>
              <p>Promotional credit: {formatDisplayAmount(balance.promotionalBalance)}</p>
              {balance.nextPromotionalExpiryAt == null ? null : (
                <p>Next promotional expiry: {formatTimestamp(balance.nextPromotionalExpiryAt, 'UTC')} UTC</p>
              )}
            </>
          )}
        </div>
      )}
      {constraints?.kind === 'available' && !waitingForCredit ? (
        <>
          <div className="arc-funding-denominations" role="group" aria-label="Choose an amount">
            {([5, 10, 20] as const).map((amount) => (
              <Button
                key={amount}
                type="button"
                className="arc-funding-denomination"
                variant="secondary"
                aria-pressed={selected === amount}
                disabled={busy || waitingForCredit}
                onClick={() => onSelect(amount)}
              >
                A${amount}
              </Button>
            ))}
          </div>
          {shortfallTooLarge ? <p className="arc-funding-detail">A$20 may not cover the amount needed.</p> : null}
          {busy ? <p className="arc-funding-detail" role="status">Getting checkout ready…</p> : null}
          <Button type="button" className="arc-funding-action" disabled={busy || waitingForCredit} onClick={onBegin} aria-busy={busy}>
            Add A${selected}
          </Button>
          <p className="arc-funding-footnote">Card or Apple Pay via Stripe. GST applies to the service fee.</p>
        </>
      ) : (
        <>
          <p className="arc-funding-detail" role="status">
            {waitingForCredit ? 'Confirm the original payment before starting another one.'
              : busy ? 'Checking card funding availability…' : 'Card funding is unavailable. You can use your available credit.'}
          </p>
          <a href="/support" target="_blank" rel="noreferrer" className="w-fit text-sm underline underline-offset-4">
            Get help (opens in a new tab)
          </a>
        </>
      )}
      {paymentStatus === 'checking' ? (
        <p className="arc-funding-detail" role="status">We’re checking your payment and balance. Keep this chat open while we confirm your credit.</p>
      ) : null}
      {paymentStatus === 'paused' ? (
        <>
          <p className="arc-funding-detail" role="status">Your previous payment still needs confirmation. Check it before adding more credit.</p>
          <Button type="button" className="arc-funding-action" onClick={onCheckPayment}>Check payment</Button>
        </>
      ) : null}
      {problem === null ? null : <p className="arc-funding-error" role="alert">{problem}</p>}
    </div>
  )
}
