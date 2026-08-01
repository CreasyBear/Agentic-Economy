import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSupplyPublisherHome } from '@/components/ae/supply/AeSupplyPublisherHome'
import { readOwnerSupplyFunnelServer } from '@/modules/capability-supply/supply-funnel.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/supply')({
  ...operatorRouteOptions,
  loader: () => readOwnerSupplyFunnelServer(),
  head: () => ({ meta: [{ title: 'Publish your service | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerSupplyHomeRoute,
})

function OwnerSupplyHomeRoute() {
  const readback = Route.useLoaderData()
  return <AeOperatorShell operatorRole="owner" title="Publish your service" description="Describe what you do, set a price, test it, and go live." currentPath="/owner/supply"><AeSupplyPublisherHome readback={readback} /></AeOperatorShell>
}
