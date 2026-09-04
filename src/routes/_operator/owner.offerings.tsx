import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'

import { AeOwnerOperationsWorkspace } from '@/components/ae/offerings/AeOwnerOperationsWorkspace'
import { AeOwnerOfferingsList } from '@/components/ae/offerings/AeOwnerOfferings'
import {
  readOwnerOperationsConnectionsSummaryServer,
  readOwnerOperationsPageServer,
  readOwnerOperationsPayoutSummaryServer,
  readOwnerOperationsPublicStatusServer,
  readOwnerProviderOffboardingServer,
} from '@/components/ae/offerings/owner-operations.functions'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { parseOwnerOperationsCompatibilitySearch } from '@/lib/operator/supply-compatibility'

export const Route = createFileRoute('/_operator/owner/offerings')({
  ...operatorRouteOptions,
  validateSearch: parseOwnerOperationsCompatibilitySearch,
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  pendingComponent: OwnerOfferingsPending,
  loader: async ({ deps }) => {
    const page = await readOwnerOperationsPageServer({ data: deps.cursor === undefined ? {} : { cursor: deps.cursor } })
    const inventory = page.inventory
    if (inventory.kind !== 'available') return { inventory }
    return {
      inventory,
      lifecycle: Promise.resolve(page.lifecycle ?? { kind: 'unavailable' as const }),
      connections: readOwnerOperationsConnectionsSummaryServer().catch(() => ({ kind: 'unavailable' as const })),
      payouts: readOwnerOperationsPayoutSummaryServer().catch(() => ({ kind: 'unavailable' as const })),
      publicStatus: readOwnerOperationsPublicStatusServer().catch(() => ({ kind: 'unavailable' as const })),
      offboarding: readOwnerProviderOffboardingServer().catch(() => ({ kind: 'unavailable' as const })),
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
