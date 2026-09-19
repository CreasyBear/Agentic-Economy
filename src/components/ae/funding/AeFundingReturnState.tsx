import { Link } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { formatDisplayAmount } from '@/modules/money/public'

export type FundingReturnViewState =
  | Readonly<{ kind: 'checking' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
      kind: 'found'
      funding: Readonly<{
        state: 'awaiting_payment' | 'processing' | 'ready' | 'expired' | 'failed'
        agentName: string
        creditAmount: Readonly<{ currency: 'AUD'; units: string; exponent: 6 }>
      }>
      refresh: 'idle' | 'checking' | 'failed'
    }>

const OPEN_BALANCE_ACTION = (
  <Link to="/owner/credit" className={cn(buttonVariants(), 'min-h-touch')}>
    Open Balance
  </Link>
)

export function AeFundingReturnState({
  pageState,
  onCheck,
}: Readonly<{
  pageState: FundingReturnViewState
  onCheck: () => Promise<void>
}>) {
  if (pageState.kind === 'checking') {
    return <AePageState tone="neutral" title="Checking funding" description="Confirming the latest status for this payment." />
  }
  if (pageState.kind === 'unavailable') {
    return (
      <AePageState
        tone="warning"
        title="Funding status unavailable"
        description="We could not confirm this payment. Do not start another payment; try checking this same payment again."
        action={(
          <Button type="button" className="min-h-touch" onClick={() => { void onCheck() }}>
            Try again
          </Button>
        )}
      />
    )
  }
  if (pageState.kind === 'not_found') {
    return (
      <AePageState
        tone="neutral"
        title="Funding link unavailable"
        description="This funding link is invalid or no longer available. Return to the agent that provided it for a current link."
        action={(
          <Link to="/market" className={cn(buttonVariants(), 'min-h-touch')}>
            Open Market
          </Link>
        )}
      />
    )
  }

  const { funding, refresh } = pageState
  const amount = formatDisplayAmount(funding.creditAmount)
  const refreshFailed = refresh === 'failed'
  const checkAction = (
    <Button
      type="button"
      className="min-h-touch"
      disabled={refresh === 'checking'}
      onClick={() => { void onCheck() }}
    >
      {refresh === 'checking' ? 'Checking this payment…' : refreshFailed ? 'Try again' : 'Check this payment'}
    </Button>
  )
  switch (funding.state) {
    case 'ready':
      return (
        <AePageState
          tone="positive"
          title="Account credit added"
          description={`${amount} is available. Return to ${funding.agentName} and ask it to retry the original Tool. Open Balance only to verify the credit.`}
          action={OPEN_BALANCE_ACTION}
        />
      )
    case 'processing':
      return (
        <AePageState
          tone={refreshFailed ? 'warning' : 'neutral'}
          title="Payment received"
          description={refreshFailed
            ? `The last confirmed state is still processing for ${funding.agentName}, but we could not refresh it. Do not start another payment; try checking this exact payment again.`
            : `Stripe has reported this payment for ${funding.agentName}, and Account credit is still being confirmed. Do not start another payment. Check this exact payment again.`}
          action={checkAction}
        />
      )
    case 'awaiting_payment':
      return (
        <AePageState
          tone={refreshFailed ? 'warning' : 'neutral'}
          title="Payment not completed"
          description={refreshFailed
            ? `The last confirmed state is still unpaid, but we could not refresh it. Finish the original secure checkout if it is still open, or return to ${funding.agentName} for the existing link. Do not start another payment.`
            : `Finish the original secure checkout if it is still open, or return to ${funding.agentName} for the existing link. Do not start another payment. Then check this exact payment again.`}
          action={checkAction}
        />
      )
    case 'expired':
      return (
        <AePageState
          tone="neutral"
          title="Funding link expired"
          description={`The unpaid link for ${amount} expired, so no credit was added. Return to ${funding.agentName}, or open Balance if you own the Account and need a new payment.`}
          action={OPEN_BALANCE_ACTION}
        />
      )
    case 'failed':
      return (
        <AePageState
          tone="warning"
          title="Payment failed"
          description={`This payment did not add ${amount} to the Account. Return to ${funding.agentName}, or open Balance if you own the Account and need a new payment.`}
          action={OPEN_BALANCE_ACTION}
        />
      )
    default: {
      const exhaustive: never = funding.state
      return exhaustive
    }
  }
}
