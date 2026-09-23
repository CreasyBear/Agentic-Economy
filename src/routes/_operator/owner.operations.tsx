import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { Boxes } from 'lucide-react'

import { AeProviderWorkspace } from '@/components/ae/offerings/provider-workspace/AeProviderWorkspace'
import { AeProviderWorkspaceSkeleton } from '@/components/ae/offerings/provider-workspace/AeProviderWorkspaceSkeleton'
import {
  readProviderWorkspaceConnectionsSummaryServer,
  readProviderWorkspacePageServer,
  readProviderWorkspacePayoutSummaryServer,
  readProviderWorkspacePublicStatusServer,
  readOwnerProviderOffboardingServer,
} from '@/components/ae/offerings/provider-workspace.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { parseOwnerToolsCompatibilitySearch } from '@/lib/operator/supply-compatibility'

export const Route = createFileRoute('/_operator/owner/operations')({
  staticData: {
    nav: {
      label: 'Tools',
      operator: {
        roles: ['owner'],
        group: 'Supply',
        groupOrder: 1,
        order: 0,
        icon: Boxes,
        tier: 'core',
        mobilePrimary: true,
        mobileOrder: 30,
      },
    },
  },
  ...operatorRouteOptions,
  validateSearch: parseOwnerToolsCompatibilitySearch,
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  pendingComponent: AeProviderWorkspaceSkeleton,
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
  if (location.pathname !== '/owner/operations') return <Outlet />
  return <AeProviderWorkspace {...data} />
}

