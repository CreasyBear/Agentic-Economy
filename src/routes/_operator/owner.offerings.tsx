import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'

import { AeOwnerOperationsWorkspace } from '@/components/ae/offerings/AeOwnerOperationsWorkspace'
import { AeOwnerOfferingsList } from '@/components/ae/offerings/AeOwnerOfferings'
import {
  readOwnerOperationsConnectionsSummaryServer,
  readOwnerOperationsInventoryServer,
  readOwnerOperationsLifecycleServer,
  readOwnerOperationsPayoutSummaryServer,
  readOwnerOperationsPublicStatusServer,
} from '@/components/ae/offerings/owner-operations.functions'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { parseOwnerOperationsCompatibilitySearch } from '@/lib/operator/supply-compatibility'

export const Route = createFileRoute('/_operator/owner/offerings')({
  ...operatorRouteOptions,
  validateSearch: parseOwnerOperationsCompatibilitySearch,
  pendingComponent: OwnerOfferingsPending,
  loader: async () => {
    const inventory = await readOwnerOperationsInventoryServer()
    if (inventory.kind !== 'available') return { inventory }
    return {
      inventory,
      lifecycle: readOwnerOperationsLifecycleServer().catch(() => ({ kind: 'unavailable' as const })),
      connections: readOwnerOperationsConnectionsSummaryServer().catch(() => ({ kind: 'unavailable' as const })),
      payouts: readOwnerOperationsPayoutSummaryServer().catch(() => ({ kind: 'unavailable' as const })),
      publicStatus: readOwnerOperationsPublicStatusServer().catch(() => ({ kind: 'unavailable' as const })),
    }
  },
  head: () => ({ meta: [{ title: 'Operations | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerOfferingsRoute,
})

function OwnerOfferingsRoute() {
  const location = useLocation()
  const data = Route.useLoaderData()
  if (location.pathname !== '/owner/offerings') return <Outlet />
  return <AeOwnerOperationsWorkspace {...data} />
}

function OwnerOfferingsPending() {
  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Operations"
      description="Publish the exact tools agents can inspect and call."
      currentPath="/owner/offerings"
    >
      <AeOwnerOfferingsList offerings={[]} loading />
    </AeOperatorShell>
  )
}
