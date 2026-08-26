import { Outlet, Link, createFileRoute, notFound, useLocation } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { AeProviderListingPage } from '@/components/ae/listing/AeProviderListingPage'
import { PublicBusinessNotFound } from '@/components/ae/listing/PublicBusinessNotFound'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { readPublicBusinessRouteServer, type PublicBusinessRouteDataResult } from '@/lib/server/public-business-route.functions'
import { serializeJsonLd } from '@/modules/seo/public'

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
    } catch {
      return { kind: 'unavailable' as const, reason: 'source_unavailable' as const, retryable: true }
    }
    if (result.kind === 'not_found') {
      throw notFound({ data: { reason: result.reason } })
    }
    return result
  },

  head: ({ loaderData }) => {
    if (loaderData?.kind === 'unavailable') {
      return {
        meta: [
          { title: 'Supplier unavailable | Agentic Economy' },
          { name: 'description', content: 'The supplier catalogue source is unavailable right now. Try again in a moment.' },
          { name: 'robots', content: 'noindex' },
        ],
      }
    }

    if (loaderData === undefined) {
      return {
        meta: [
          { title: 'Page not found | Agentic Economy' },
          { name: 'robots', content: 'noindex' },
        ],
      }
    }

    return {
      meta: [
        { title: `${loaderData.page.catalog.name} Operations | Agentic Economy` },
        { name: 'description', content: `Browse published Operations, prices, readiness, and access paths from ${loaderData.page.catalog.name}.` },
        { name: 'robots', content: loaderData.seo.indexDirective },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Agentic Economy' },
        { property: 'og:title', content: `${loaderData.page.catalog.name} Operations | Agentic Economy` },
        { property: 'og:description', content: `Browse published Operations, prices, readiness, and access paths from ${loaderData.page.catalog.name}.` },
        { property: 'og:url', content: loaderData.seo.canonicalUrl },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: `${loaderData.page.catalog.name} Operations | Agentic Economy` },
        { name: 'twitter:description', content: `Browse published Operations, prices, readiness, and access paths from ${loaderData.page.catalog.name}.` },
      ],
      links: [{ rel: 'canonical', href: loaderData.seo.canonicalUrl }],
      scripts: [
        {
          type: 'application/ld+json',
          children: serializeJsonLd(loaderData.seo.jsonLd),
        },
      ],
    }
  },
  pendingComponent: ProviderListingPending,
  errorComponent: ProviderListingError,
  notFoundComponent: PublicBusinessNotFound,
  component: PublicBusinessRoute,
})


function ProviderListingPending() {
  return (
    <AePublicShell>
      <article className="ae-rail grid gap-6 py-section" aria-busy="true" aria-label="Loading supplier">
        <Skeleton className="h-11 w-36" />
        <header className="grid gap-4 border-b border-border pb-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        </header>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="overflow-hidden rounded-card border border-border bg-card">
            <Skeleton className="h-16 w-full rounded-none" />
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 w-full rounded-none border-t border-border" />)}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </article>
    </AePublicShell>
  )
}
function ProviderListingError() {
  const { pathname } = useLocation()

  return (
    <AePageState
      tone="danger"
      title="This supplier didn’t load"
      description="Try again, or return to the catalogue."
      action={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="default" className="min-h-11"><a href={pathname}>Try again</a></Button>
          <Button asChild variant="secondary" className="min-h-11"><Link to="/market" search={{ window: '30d' }} hash="operations">Back to catalog</Link></Button>
        </div>
      }
    />
  )
}

export function PublicBusinessUnavailable() {
  const { pathname } = useLocation()

  return (
    <AePageState
      tone="warning"
      title="Supplier temporarily unavailable"
      description="The supplier catalogue source is unavailable right now. Try again in a moment."
      action={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="default" className="min-h-11"><a href={pathname}>Try again</a></Button>
          <Button asChild variant="secondary" className="min-h-11"><Link to="/market" search={{ window: '30d' }} hash="operations">Back to catalog</Link></Button>
        </div>
      }
    />
  )
}

function PublicBusinessRoute() {
  const { slug } = Route.useParams()
  const { from, id } = Route.useSearch()
  const location = useLocation()
  const routeData = Route.useLoaderData()

  if (location.pathname !== `/${slug}`) {
    return <Outlet />
  }

  if (routeData.kind === 'unavailable') {
    return <PublicBusinessUnavailable />
  }

  const { page, supply } = routeData
  const catalog = page.catalog
  const agentJsonUrl = `/api/businesses/${catalog.slug}`

  return (
    <AePublicShell>
      <AeProviderListingPage
        catalog={catalog}
        agentJsonUrl={agentJsonUrl}
        {...(supply === undefined ? {} : { supply })}
        {...(from === undefined ? {} : { backFrom: from })}
        {...(id === undefined ? {} : { backThreadId: id })}
      />
    </AePublicShell>
  )
}
