import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'

import { AeProviderWorkspace } from '@/components/ae/offerings/provider-workspace/AeProviderWorkspace'
import { AeProviderWorkspaceSkeleton } from '@/components/ae/offerings/provider-workspace/AeProviderWorkspaceSkeleton'
import {
  readProviderWorkspaceConnectionsSummaryServer,
  readProviderWorkspacePageServer,
  readProviderWorkspacePublicStatusServer,
  readOwnerProviderOffboardingServer,
} from '@/components/ae/offerings/provider-workspace.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { parseOwnerToolsCompatibilitySearch } from '@/lib/operator/supply-compatibility'

export const Route = createFileRoute('/_operator/owner/operations')({
  ...operatorRouteOptions,
  validateSearch: parseOwnerToolsCompatibilitySearch,
  loaderDeps: ({ search }) => ({ ...(search.cursor === undefined ? {} : { cursor: search.cursor }), ...('q' in search && search.q !== undefined ? { q: search.q } : {}), ...('sort' in search && search.sort !== undefined ? { sort: search.sort } : {}) }),
  pendingComponent: AeProviderWorkspaceSkeleton,
  loader: async ({ deps }) => {
    const page = await readProviderWorkspacePageServer({ data: deps })
    const inventory = page.inventory
    if (inventory.kind !== 'available') return { inventory }
    return {
      inventory,
      lifecycle: Promise.resolve(page.lifecycle ?? { kind: 'unavailable' as const }),
      connections: readProviderWorkspaceConnectionsSummaryServer().catch(() => ({ kind: 'unavailable' as const })),
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
  const inventoryQuery = Route.useLoaderDeps()
  if (location.pathname !== '/owner/operations') return <Outlet />
  return <AeProviderWorkspace {...data} inventoryQuery={inventoryQuery} />
}

