import { createFileRoute } from '@tanstack/react-router'

import { AeFundingReturnPage } from '@/components/ae/funding/AeFundingReturnPage'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'

export const Route = createFileRoute('/fund/$fundingSessionId')({
  head: () => ({ meta: [
    { title: 'Funding status | Agentic Economy' },
    { name: 'robots', content: 'noindex, noarchive' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: FundingReturnRoute,
})

function FundingReturnRoute() {
  const { fundingSessionId } = Route.useParams()
  return <AeFundingReturnPage fundingSessionId={fundingSessionId} />
}
