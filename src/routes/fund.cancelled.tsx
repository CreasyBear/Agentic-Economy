import { Link, createFileRoute } from '@tanstack/react-router'

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
      title="Payment cancelled"
      description="No Account credit or authority changed. Return to the agent if you still want to fund it."
      action={(
        <Link to="/market" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>
          Back to Market
        </Link>
      )}
    />
  ),
})
