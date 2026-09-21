import { Link, createFileRoute } from '@tanstack/react-router'

import { fundingReturnCopy } from '@/components/ae/funding/funding-return.contracts'
import { AePageState } from '@/components/ae/layout/AePageState'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/fund/cancelled')({
  head: () => ({ meta: [
    { title: 'Payment cancelled | Agentic Economy' },
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
        <div className="flex flex-wrap gap-3">
          <Link to="/owner/credit" className={cn(buttonVariants(), 'min-h-touch')}>
            {fundingReturnCopy.cancelled.retryAction}
          </Link>
          <Link to="/agent-access" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>
            {fundingReturnCopy.openAgentsAction}
          </Link>
        </div>
      )}
    />
  ),
})
