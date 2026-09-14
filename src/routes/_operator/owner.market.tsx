import { createFileRoute } from '@tanstack/react-router'
import { StoreIcon } from 'lucide-react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeX402Directory } from '@/components/ae/market/AeX402Directory'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { loadMarketRouteData, marketLoaderDeps, validateMarketSearch } from '@/modules/market/market-route-data'

export const Route = createFileRoute('/_operator/owner/market')({
  staticData: {
    nav: {
      label: 'Market',
      operator: {
        roles: ['owner'],
        group: 'Buy',
        groupOrder: 0,
        order: 0,
        icon: StoreIcon,
        tier: 'core',
        mobilePrimary: true,
        mobileOrder: 10,
      },
    },
  },
  ...operatorRouteOptions,
  validateSearch: validateMarketSearch,
  loaderDeps: ({ search }) => marketLoaderDeps(search),
  loader: ({ deps }) => loadMarketRouteData(deps),
  staleTime: 30_000,
  preloadStaleTime: 30_000,
  pendingMs: 1_000,
  pendingMinMs: 500,
  head: () => ({ meta: [{ title: 'Market | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerMarketRoute,
})

function OwnerMarketRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Market"
      description="Find and compare a Tool, then continue through your Agent."
      currentPath="/owner/market"
    >
      <AeX402Directory
        workspace
        marketPath="/owner/market"
        activeView={data.view}
        page={data.page}
        search={search}
        catalogue={data.catalogue}
        overview={data.overview}
        {...(data.providers === undefined ? {} : { providers: data.providers })}
        {...(data.home === undefined ? {} : { home: data.home })}
      />
    </AeOperatorPage>
  )
}
