import { Button } from '@/components/ui/button'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { formatDisplayAmount } from '@/modules/money/public'
import type { AddCreditPanelProps } from '../add-credit.contracts'

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
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-foreground">Sign in to get answers that cost a few cents.</p>
        <Button nativeButton={false} role="link" className="min-h-touch" render={<a href={signInHref} />}>Continue</Button>
      </div>
    )
  }

  if (!payingOn && !waitingForCredit) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-foreground">Let aecon spend up to A$1 per answer and A$5 a day for you. Every charge shows under the answer.</p>
        <Button type="button" className="min-h-touch" disabled={enableBusy} onClick={onEnablePaying}>
          {enableBusy ? 'Turning on…' : 'Turn on'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {balance === null ? null : (
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>Available balance: {formatDisplayAmount(balance.totalBalance ?? balance.balance)}</p>
          {balance.promotionalBalance === undefined ? null : <>
            <p>Purchased credit: {formatDisplayAmount(balance.balance)}</p>
            <p>Promotional credit: {formatDisplayAmount(balance.promotionalBalance)}</p>
            {balance.nextPromotionalExpiryAt == null ? null : <p>Next promotional expiry: {formatUtcTimestamp(balance.nextPromotionalExpiryAt)} UTC</p>}
          </>}
        </div>
      )}
      {constraints?.kind === 'available' && !waitingForCredit ? <>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose an amount">
          {([5, 10, 20] as const).map((amount) => (
            <Button key={amount} type="button" className="min-h-touch"
              variant={selected === amount ? 'default' : 'outline'} aria-pressed={selected === amount}
              disabled={busy || waitingForCredit} onClick={() => onSelect(amount)}>
              A${amount}
            </Button>
          ))}
        </div>
        {shortfallTooLarge ? <p className="text-sm text-muted-foreground">A$20 may not cover the amount needed.</p> : null}
        {busy ? <p className="text-sm text-muted-foreground" role="status">Getting checkout ready…</p> : null}
        <Button type="button" className="min-h-touch" disabled={busy || waitingForCredit} onClick={onBegin} aria-busy={busy}>
          Add A${selected}
        </Button>
        <p className="text-xs text-muted-foreground">Card or Apple Pay via Stripe. GST applies to the service fee.</p>
      </> : <>
        <p className="text-sm text-muted-foreground" role="status">
          {waitingForCredit ? 'Confirm the original payment before starting another one.'
            : busy ? 'Checking card funding availability…' : 'Card funding is unavailable. You can use your available credit.'}
        </p>
        <a href="/support" target="_blank" rel="noreferrer" className="w-fit text-sm underline underline-offset-4">
          Get help (opens in a new tab)
        </a>
      </>}
      {paymentStatus === 'checking' ? <p className="text-sm text-muted-foreground" role="status">We’re checking your payment and balance. Keep this chat open while we confirm your credit.</p> : null}
      {paymentStatus === 'paused' ? <>
        <p className="text-sm text-muted-foreground" role="status">Your previous payment still needs confirmation. Check it before adding more credit.</p>
        <Button type="button" className="min-h-touch" onClick={onCheckPayment}>Check payment</Button>
      </> : null}
      {problem === null ? null : <p className="text-sm text-destructive" role="alert">{problem}</p>}
    </div>
  )
}
