import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSupplyPublisherHome } from '@/components/ae/supply/AeSupplyPublisherHome'
import { readOwnerOfferingSupplyServer } from '@/components/ae/offerings/owner-offering.functions'
import { readOwnerConnectReadinessServer } from '@/modules/money/server'
import { readOwnerProviderEarningsServer, readOwnerSupplyFunnelServer } from '@/modules/capability-supply/supply-funnel.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/supply')({
  loader: async () => {
    const offerings = await readOwnerOfferingSupplyServer()
    if (offerings.kind !== 'available') {
      const [earnings, connect] = await Promise.all([readOwnerProviderEarningsServer(), readOwnerConnectReadinessServer()])
      return { supply: offerings, earnings, connect }
    }
    const [supply, earnings, connect] = await Promise.all([
      readOwnerSupplyFunnelServer({ data: { businessId: offerings.businessId } }),
      readOwnerProviderEarningsServer(),
      readOwnerConnectReadinessServer(),
    ])
    return { supply, earnings, connect }
  },
  head: () => ({ meta: [{ title: 'Publish your service | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerSupplyHomeRoute,
})

function OwnerSupplyHomeRoute() {
  const location = useLocation()
  return location.pathname !== '/owner/supply' ? <Outlet /> : <OwnerSupplyHome />
}

function OwnerSupplyHome() {
  const { supply, earnings, connect } = Route.useLoaderData()
  return <AeOperatorShell operatorRole="owner" title="Publish your service" description="Describe what you do, set a price, test it, and go live." currentPath="/owner/supply"><AeSupplyPublisherHome readback={supply} earnings={earnings} connect={connect} /></AeOperatorShell>
}
