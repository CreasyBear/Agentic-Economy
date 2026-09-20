import { Outlet, createFileRoute, notFound, useLocation } from '@tanstack/react-router'

import { PublicBusinessNotFound } from '@/components/ae/listing/PublicBusinessNotFound'
import {
  AePublicBusiness,
  ProviderListingError,
  ProviderListingPending,
} from '@/components/ae/listing/public-business/AePublicBusiness'
import { degrade } from '@/lib/observability/degrade'
import { readPublicBusinessRouteServer, type PublicBusinessRouteDataResult } from '@/lib/server/public-business-route.functions'
import { buildPublicBusinessPageHead } from '@/modules/seo/public-route'

type ProviderListingSearch = {
  from?: 'thread'
  id?: string
}

export const Route = createFileRoute('/$slug')({
  validateSearch: (search: Record<string, unknown>): ProviderListingSearch => {
    const from = search.from === 'thread' ? search.from : undefined
    const id = typeof search.id === 'string' && search.id.trim().length > 0 ? search.id.trim() : undefined
    return {
      ...(from === undefined ? {} : { from }),
      ...(id === undefined ? {} : { id }),
    }
  },
  loader: async ({ params }) => {
    let result: PublicBusinessRouteDataResult
    try {
      result = await readPublicBusinessRouteServer({ data: { slug: params.slug } })
    } catch (cause) {
      return degrade(cause, { kind: 'unavailable' as const, reason: 'source_unavailable' as const, retryable: true } as const, {
        site: 'publicBusinessRouteLoader',
        reason: 'source_unavailable',
      })
    }
    if (result.kind === 'not_found') {
      throw notFound({ data: { reason: result.reason } })
    }
    return result
  },
  head: ({ loaderData }) => buildPublicBusinessPageHead(loaderData),
  pendingComponent: ProviderListingPending,
  errorComponent: ProviderListingError,
  notFoundComponent: PublicBusinessNotFound,
  component: PublicBusinessRoute,
})

function PublicBusinessRoute() {
  const { slug } = Route.useParams()
  const search = Route.useSearch()
  const location = useLocation()
  const routeData = Route.useLoaderData()

  if (location.pathname !== `/${slug}`) {
    return <Outlet />
  }

  return (
    <AePublicBusiness
      routeData={routeData}
      {...(search.from === undefined ? {} : { backFrom: search.from })}
      {...(search.id === undefined ? {} : { backThreadId: search.id })}
    />
  )
}
