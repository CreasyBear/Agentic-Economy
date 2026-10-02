import { Link, createFileRoute } from '@tanstack/react-router'

import { fundingReturnCopy } from '@/components/ae/funding/funding-return.contracts'
import { AePageState } from '@/components/ae/layout/AePageState'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'
import buttonStyles from '@/components/arc/button/button.module.css'

export const Route = createFileRoute('/fund/cancelled')({
  head: () => ({ meta: [
    { title: 'Check your payment | Agentic Economy' },
    { name: 'robots', content: 'noindex, noarchive' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: () => (
    <AePageState
      tone="neutral"
      title={fundingReturnCopy.cancelled.title}
      description={fundingReturnCopy.cancelled.description}
      action={(
        <div className="arc-market arc-recovery-action-row">
          <Link to="/owner/credit" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>
            {fundingReturnCopy.cancelled.openCreditAction}
          </Link>
          <Link to="/agent-access" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>
            {fundingReturnCopy.openAgentsAction}
          </Link>
        </div>
      )}
    />
  ),
})
