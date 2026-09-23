import { Link } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import {
  fundingReturnCopy,
  type FundingReturnPageState,
} from '@/components/ae/funding/funding-return.contracts'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { formatDisplayAmount } from '@/modules/money/public'
import type { FundingReturnViewState } from '@/modules/money/funding-return.view-model'

export type AeFundingReturnStateProps = Readonly<{
  pageState: FundingReturnViewState
  onCheck: () => Promise<void>
}>

const OPEN_CREDIT_ACTION = (
  <Link to="/owner/credit" className={cn(buttonVariants(), 'min-h-touch')}>
    {fundingReturnCopy.openCreditAction}
  </Link>
)

const OPEN_AGENTS_ACTION = (
  <Link to="/agent-access" className={cn(buttonVariants(), 'min-h-touch')}>
    {fundingReturnCopy.openAgentsAction}
  </Link>
)

function deriveFundingReturnPageState(
  pageState: FundingReturnViewState,
  onCheck: () => Promise<void>,
): FundingReturnPageState {
  if (pageState.kind === 'checking') {
    return {
      tone: 'neutral',
      title: 'Checking funding',
      description: 'Confirming the latest status for this payment.',
      focusTitle: true,
    }
  }
  if (pageState.kind === 'unavailable') {
    return {
      tone: 'warning',
      title: 'Funding status unavailable',
      description: 'We could not confirm this payment. Do not start another payment; try checking this same payment again.',
      action: (
        <Button type="button" className="min-h-touch" onClick={() => { void onCheck() }}>
          Try again
        </Button>
      ),
    }
  }
  if (pageState.kind === 'not_found') {
    return {
      tone: 'neutral',
      title: fundingReturnCopy.invalid.title,
      description: fundingReturnCopy.invalid.description,
      action: OPEN_CREDIT_ACTION,
    }
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
      return {
        tone: 'positive',
        title: fundingReturnCopy.paid.title,
        description: fundingReturnCopy.paid.description(amount, funding.agentName),
        action: OPEN_AGENTS_ACTION,
      }
    case 'processing':
      return {
        tone: refreshFailed ? 'warning' : 'neutral',
        title: 'Payment received',
        description: refreshFailed
          ? `The last confirmed state is still processing for ${funding.agentName}, but we could not refresh it. Do not start another payment; try checking this exact payment again.`
          : `Stripe has reported this payment for ${funding.agentName}, and Account credit is still being confirmed. Do not start another payment. Check this exact payment again.`,
        action: checkAction,
      }
    case 'awaiting_payment':
      return {
        tone: refreshFailed ? 'warning' : 'neutral',
        title: 'Payment not completed',
        description: refreshFailed
          ? `The last confirmed state is still unpaid, but we could not refresh it. Finish the original secure checkout if it is still open, or return to ${funding.agentName} for the existing link. Do not start another payment.`
          : `Finish the original secure checkout if it is still open, or return to ${funding.agentName} for the existing link. Do not start another payment. Then check this exact payment again.`,
        action: checkAction,
      }
    case 'expired':
      return {
        tone: 'neutral',
        title: 'Funding link expired',
        description: `The unpaid link for ${amount} expired, so no Credit was added. Return to ${funding.agentName}, or open Credit if you own the Account and need a new payment.`,
        action: OPEN_CREDIT_ACTION,
      }
    case 'failed':
      return {
        tone: 'warning',
        title: 'Payment failed',
        description: `This payment did not add ${amount} to the Account. Return to ${funding.agentName}, or open Credit if you own the Account and need a new payment.`,
        action: OPEN_CREDIT_ACTION,
      }
    default: {
      const exhaustive: never = funding.state
      return exhaustive
    }
  }
}

export function AeFundingReturnState({
  pageState,
  onCheck,
}: AeFundingReturnStateProps) {
  const derived = deriveFundingReturnPageState(pageState, onCheck)
  return (
    <AePageState
      tone={derived.tone}
      title={derived.title}
      description={derived.description}
      {...(derived.action === undefined ? {} : { action: derived.action })}
      {...(derived.focusTitle === true ? { focusTitle: true } : {})}
    />
  )
}
