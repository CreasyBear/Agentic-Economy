import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSupplyPublisherHome } from '@/components/ae/supply/AeSupplyPublisherHome'
import { readOwnerProviderEarningsServer, readOwnerSupplyFunnelServer } from '@/modules/capability-supply/supply-funnel.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/supply')({
  ...operatorRouteOptions,
  loader: async () => {
    const [supply, earnings] = await Promise.all([readOwnerSupplyFunnelServer(), readOwnerProviderEarningsServer()])
    return { supply, earnings }
  },
  head: () => ({ meta: [{ title: 'Publish your service | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerSupplyHomeRoute,
})

function OwnerSupplyHomeRoute() {
  const location = useLocation()
  return location.pathname !== '/owner/supply' ? <Outlet /> : <OwnerSupplyHome />
}

function OwnerSupplyHome() {
  const { supply, earnings } = Route.useLoaderData()
  return <AeOperatorShell operatorRole="owner" title="Publish your service" description="Describe what you do, set a price, test it, and go live." currentPath="/owner/supply"><AeSupplyPublisherHome readback={supply} earnings={earnings} /></AeOperatorShell>
}
