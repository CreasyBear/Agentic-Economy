import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSupplyPublisherHome } from '@/components/ae/supply/AeSupplyPublisherHome'
import { readOwnerOfferingSupplyServer } from '@/components/ae/offerings/owner-offering.functions'
import { readOwnerConnectReadinessServer } from '@/modules/money/server'
import { readOwnerProviderConnectionsServer, readOwnerProviderEarningsServer, readOwnerSupplyFunnelServer } from '@/modules/capability-supply/supply-funnel.functions'

export const Route = createFileRoute('/_operator/owner/supply')({
  loader: async () => {
    const offerings = await readOwnerOfferingSupplyServer()
    if (offerings.kind !== 'available') {
      const [earnings, connect] = await Promise.all([
        readOwnerProviderEarningsServer(),
        readOwnerConnectReadinessServer(),
      ])
      return { supply: offerings, earnings, connect, connections: [] }
    }
    const [supply, earnings, connect, connections] = await Promise.all([
      readOwnerSupplyFunnelServer({ data: { businessId: offerings.businessId } }),
      readOwnerProviderEarningsServer(),
      readOwnerConnectReadinessServer(),
      readOwnerProviderConnectionsServer(),
    ])
    return { supply, earnings, connect, connections }
  },
  head: () => ({ meta: [{ title: 'Publish Operations | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerSupplyHomeRoute,
})

function OwnerSupplyHomeRoute() {
  const location = useLocation()
  return location.pathname !== '/owner/supply' ? <Outlet /> : <OwnerSupplyHome />
}

function OwnerSupplyHome() {
  const { supply, earnings, connect, connections } = Route.useLoaderData()
  return <AeOperatorShell operatorRole="owner" title="Publish Operations" description="Connect a tool, set its price, test the route, and publish it." currentPath="/owner/supply"><AeSupplyPublisherHome readback={supply} earnings={earnings} connect={connect} connections={connections} /></AeOperatorShell>
}
