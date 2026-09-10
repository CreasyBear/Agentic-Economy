import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'

import { AeProviderWorkspace } from '@/components/ae/offerings/AeProviderWorkspace'
import { AeOwnerOfferingsList } from '@/components/ae/offerings/AeOwnerOfferings'
import {
  readProviderWorkspaceConnectionsSummaryServer,
  readProviderWorkspacePageServer,
  readProviderWorkspacePayoutSummaryServer,
  readProviderWorkspacePublicStatusServer,
  readOwnerProviderOffboardingServer,
} from '@/components/ae/offerings/provider-workspace.functions'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { parseOwnerToolsCompatibilitySearch } from '@/lib/operator/supply-compatibility'

export const Route = createFileRoute('/_operator/owner/offerings')({
  ...operatorRouteOptions,
  validateSearch: parseOwnerToolsCompatibilitySearch,
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  pendingComponent: OwnerOfferingsPending,
  loader: async ({ deps }) => {
    const page = await readProviderWorkspacePageServer({ data: deps.cursor === undefined ? {} : { cursor: deps.cursor } })
    const inventory = page.inventory
    if (inventory.kind !== 'available') return { inventory }
    return {
      inventory,
      lifecycle: Promise.resolve(page.lifecycle ?? { kind: 'unavailable' as const }),
      connections: readProviderWorkspaceConnectionsSummaryServer().catch(() => ({ kind: 'unavailable' as const })),
      payouts: readProviderWorkspacePayoutSummaryServer().catch(() => ({ kind: 'unavailable' as const })),
      publicStatus: readProviderWorkspacePublicStatusServer().catch(() => ({ kind: 'unavailable' as const })),
      offboarding: readOwnerProviderOffboardingServer().catch(() => ({ kind: 'unavailable' as const })),
    }
  },
  head: () => ({ meta: [{ title: 'Tools | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerOfferingsRoute,
})

function OwnerOfferingsRoute() {
  const location = useLocation()
  const data = Route.useLoaderData()
  if (location.pathname !== '/owner/offerings') return <Outlet />
  return <AeProviderWorkspace {...data} />
}

function OwnerOfferingsPending() {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Tools"
      description="Publish the exact tools agents can inspect and call."
      currentPath="/owner/offerings"
    >
      <AeOwnerOfferingsList offerings={[]} loading />
    </AeOperatorPage>
  )
}
