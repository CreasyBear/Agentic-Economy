import { Link, createFileRoute } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'
import { Button } from '@/components/ui/button'

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
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="default" className="min-h-touch"><Link to="/owner/credit">Try again</Link></Button>
          <Button asChild variant="secondary" className="min-h-touch"><Link to="/market">Back to Market</Link></Button>
        </div>
      )}
    />
  ),
})
