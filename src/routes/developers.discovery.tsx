import { createFileRoute } from '@tanstack/react-router'
import { SearchCode } from 'lucide-react'

import { AeDeveloperDiscoveryPage } from '@/components/ae/developers/discovery/AeDeveloperDiscoveryPage'
import { buildDeveloperDiscoveryViewModel } from '@/components/ae/developers/discovery/discovery.view-model'
import { loadDeveloperDiscoveryRouteServer } from '@/modules/discovery/developer-discovery-route'

export const Route = createFileRoute('/developers/discovery')({
  staticData: {
    nav: {
      label: 'Discovery',
      operator: {
        roles: ['developer'],
        group: 'Records',
        groupOrder: 0,
        order: 0,
        icon: SearchCode,
        tier: 'core',
      },
    },
  },
  loader: () => loadDeveloperDiscoveryRouteServer(),
  head: ({ loaderData }) => {
    const title = loaderData?.copy.title ?? 'Discovery status'
    return {
      meta: [
        { title: `${title} | Agentic Economy` },
        {
          name: 'description',
          content: loaderData?.copy.description ?? 'Public discovery artifact status, origin, and freshness.',
        },
        { name: 'robots', content: 'noindex' },
      ],
    }
  },
  component: DevelopersDiscoveryRoute,
})

function DevelopersDiscoveryRoute() {
  const readback = Route.useLoaderData()
  return <AeDeveloperDiscoveryPage model={buildDeveloperDiscoveryViewModel(readback)} />
}
