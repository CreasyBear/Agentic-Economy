import { activityReturnScopeSchema, buyerReturnDestination } from '@/lib/call-recovery/activity-return-scope'
import { Link, createFileRoute } from '@tanstack/react-router'

import { fundingReturnCopy } from '@/components/ae/funding/funding-return.contracts'
import { AePageState } from '@/components/ae/layout/AePageState'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export const Route = createFileRoute('/fund/cancelled')({
  validateSearch: activityReturnScopeSchema,
  head: () => ({ meta: [
    { title: 'Check your payment | Agentic Economy' },
    { name: 'robots', content: 'noindex, noarchive' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: FundingCancelledRoute,
})

function FundingCancelledRoute() {
  const destination = buyerReturnDestination(Route.useSearch())
  return (
    <AePageState
      tone="neutral"
      title={fundingReturnCopy.cancelled.title}
      description={fundingReturnCopy.cancelled.description}
      action={(
        <div className="arc-market arc-recovery-action-row">
          {destination === undefined ? null : <a href={destination.href} className={actionLinkClassName('secondary', 'md')}>{destination.label}</a>}
          <Link to="/owner/credit" className={actionLinkClassName('primary', 'md')}>
            {fundingReturnCopy.cancelled.openCreditAction}
          </Link>
          <Link to="/agent-access" className={actionLinkClassName('secondary', 'md')}>
            {fundingReturnCopy.openAgentsAction}
          </Link>
        </div>
      )}
    />
  )
}
