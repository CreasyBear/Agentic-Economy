import { Button } from '@/components/ui/button'
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
  waitingForCredit,
  problem,
  balanceLabel,
  shortfallTooLarge,
}: AddCreditPanelProps) {
  if (!signedIn) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-foreground">Sign in to get answers that cost a few cents.</p>
        <Button className="min-h-touch" render={<a href={signInHref} />}>Continue</Button>
      </div>
    )
  }

  if (!payingOn) {
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
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose an amount">
        {([5, 10, 20] as const).map((amount) => (
          <Button
            key={amount}
            type="button"
            className="min-h-touch"
            variant={selected === amount ? 'default' : 'outline'}
            aria-pressed={selected === amount}
            disabled={busy || waitingForCredit}
            onClick={() => onSelect(amount)}
          >
            A${amount}
          </Button>
        ))}
      </div>
      {shortfallTooLarge ? <p className="text-sm text-muted-foreground">A$20 may not cover the amount needed.</p> : null}
      {balanceLabel === null ? null : <p className="text-sm text-muted-foreground">Available balance: {balanceLabel}</p>}
      {busy ? <p className="text-sm text-muted-foreground" role="status">Getting checkout ready…</p> : null}
      <Button type="button" className="min-h-touch" disabled={busy || waitingForCredit} onClick={onBegin} aria-busy={busy}>
        Add A${selected}
      </Button>
      {waitingForCredit ? <p className="text-sm text-muted-foreground" role="status">We’re checking your balance. Keep this chat open while we confirm your credit.</p> : null}
      {problem === null ? null : <p className="text-sm text-destructive" role="alert">{problem}</p>}
      <p className="text-xs text-muted-foreground">Card or Apple Pay via Stripe. GST applies to the service fee.</p>
    </div>
  )
}
