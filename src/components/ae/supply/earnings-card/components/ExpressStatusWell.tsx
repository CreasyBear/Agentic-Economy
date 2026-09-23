import { AlertCircleIcon, CheckCircle2Icon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export type ExpressStatusWellProps = Readonly<{
  accountState: string
  stripeMaskLabel?: string
  stripeMaskAriaLabel?: string
  showStripeUnbound: boolean
  expressStatusExplanation: string
}>

function expressStatusBadge(accountState: string) {
  if (accountState === 'ready') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2Icon className="size-3" />
        Stripe Express Account Active
      </Badge>
    )
  }
  if (accountState === 'submitted' || accountState === 'onboarding_started') {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertCircleIcon className="size-3" />
        Verification Pending
      </Badge>
    )
  }
  if (accountState === 'restricted') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircleIcon className="size-3" />
        Action Required
      </Badge>
    )
  }
  return (
    <Badge variant="warning" className="gap-1">
      <AlertCircleIcon className="size-3" />
      Action Required
    </Badge>
  )
}

export function ExpressStatusWell({
  accountState,
  stripeMaskLabel,
  stripeMaskAriaLabel,
  showStripeUnbound,
  expressStatusExplanation,
}: ExpressStatusWellProps) {
  return (
    <div
      className="grid min-h-[7.5rem] gap-2 rounded-lg border bg-muted/20 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {expressStatusBadge(accountState)}
        {showStripeUnbound ? (
          <span className="text-xs text-muted-foreground">
            Stripe account not bound yet.
          </span>
        ) : (
          <span
            className="font-mono text-xs tabular-nums text-muted-foreground"
            {...(stripeMaskAriaLabel === undefined
              ? {}
              : { 'aria-label': stripeMaskAriaLabel })}
          >
            {stripeMaskLabel}
          </span>
        )}
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        {expressStatusExplanation}
      </p>
      <p className="m-0 text-xs text-muted-foreground">
        Direct AUD bank credits are managed directly in Stripe Express.
        Agentic Economy never stores bank account credentials.
      </p>
    </div>
  )
}
