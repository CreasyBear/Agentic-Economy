import { Outlet, createFileRoute, notFound, useLocation, type NotFoundRouteProps } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty'

import { AeProviderListingPage } from '@/components/ae/listing/AeProviderListingPage'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import type { PublicBusinessPageNotFoundReason } from '@/modules/catalog/public'
import { readPublicBusinessRouteServer } from '@/modules/catalog/public-route.functions'
import {
  buildPublicInquiryAffordance,
  projectPublicInquiryAvailability,
} from '@/modules/inquiries/route-readbacks'
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
    const result = await readPublicBusinessRouteServer({ data: { slug: params.slug } })
    if (result.kind === 'not_found') {
      throw notFound({ data: { reason: result.reason } })
    }
    return result
  },

  head: ({ loaderData }) => {
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
        { title: loaderData.seo.title },
        { name: 'description', content: loaderData.seo.description },
        { name: 'robots', content: loaderData.seo.indexDirective },
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
      <article className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 md:px-6 md:py-10" aria-busy="true" aria-label="Loading listing">
        <nav aria-label="Return to your previous view">
          <Skeleton className="h-9 w-40" />
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="grid gap-8">
            <Card className="overflow-hidden p-6" aria-label="Loading listing header">
              <div className="flex flex-col gap-5">
                <div className="flex flex-row flex-wrap items-center gap-2">
                  <Skeleton className="h-6 w-6" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-16 w-[82%]" />
                  <Skeleton className="h-7 w-[44%]" />
                </div>
                <div className="flex flex-row flex-wrap items-center gap-3">
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-7 w-40" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-12 w-[70%]" />
              </div>
            </Card>

            <Card className="grid gap-4 p-5" aria-label="Loading listing photos">
              <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                <Skeleton className="h-52 w-full" />
                <Skeleton className="h-52 w-full" />
                <Skeleton className="h-52 w-full" />
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
              <Card className="p-5" aria-label="Loading reach-out steps">
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-6 w-56" />
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="flex flex-row items-start gap-3">
                      <Skeleton className="h-4 w-4" />
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3 w-52" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5" aria-label="Loading source dates">
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-6 w-36" />
                  <Skeleton className="h-9 w-60" />
                  <Skeleton className="h-9 w-56" />
                </div>
              </Card>
            </div>

            <Card className="grid gap-6 p-6" aria-label="Loading listing details">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-72" />
              </div>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex flex-col gap-3">
                  <Skeleton className="h-3 w-36" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                </div>
              ))}
            </Card>
          </div>

          <aside className="grid content-start gap-6 lg:sticky lg:top-20" aria-label="Loading actions for this business">
            <Card className="p-5">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-6 w-52" />
                  <Skeleton className="h-12 w-full" />
                </div>
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            </Card>

            <Card className="bg-card p-5" aria-label="Loading assistant details">
              <div className="flex flex-col gap-3">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-9 w-48" />
              </div>
            </Card>

            <Skeleton className="h-4 w-44" />
          </aside>
        </div>
      </article>
    </AePublicShell>
  )
}
function ProviderListingError() {
  const { pathname } = useLocation()

  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6">
        <Empty className="border border-border bg-card p-5">
          <EmptyHeader>
            <h1 className="text-lg font-medium tracking-tight">This listing didn't load</h1>
            <EmptyDescription>Try the page again, or return to services to compare listed businesses.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild variant="default" className="min-h-11"><a href={pathname}>Try again</a></Button>
              <Button asChild variant="secondary" className="min-h-11"><a href="/">Back to services</a></Button>
            </div>
          </EmptyContent>
        </Empty>
      </section>
    </AePublicShell>
  )
}

export function PublicBusinessNotFound({ data }: NotFoundRouteProps) {
  // `data` crosses the router's not-found boundary untyped, and a bare notFound()
  // raised anywhere under /$slug carries none: default to the claim we can defend.
  const reason: PublicBusinessPageNotFoundReason =
    typeof data === 'object' && data !== null && 'reason' in data && data.reason === 'not_public'
      ? 'not_public'
      : 'no_such_business'

  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        {reason === 'not_public' ? (
          <Empty className="border border-border bg-card p-5">
            <EmptyHeader>
              <h1 className="text-lg font-medium tracking-tight">Business page unavailable</h1>
              <EmptyDescription>This page is not visible right now. The business may need to claim or review it.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild variant="default" className="min-h-11"><a href="/claim">Claim your business page</a></Button>
                <Button asChild variant="secondary" className="min-h-11"><a href="/">Browse businesses</a></Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="border border-border bg-card p-5">
            <EmptyHeader>
              <h1 className="text-lg font-medium tracking-tight">No business page at this address</h1>
              <EmptyDescription>Nothing is published here. Check the address, or browse the businesses that are listed.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild variant="default" className="min-h-11"><a href="/">Browse businesses</a></Button>
                <Button asChild variant="secondary" className="min-h-11"><a href="/">Ask a question</a></Button>
              </div>
            </EmptyContent>
          </Empty>
        )}
      </section>
    </AePublicShell>
  )
}

function PublicBusinessRoute() {
  const { slug } = Route.useParams()
  const { from, id } = Route.useSearch()
  const location = useLocation()
  const { page, admission, supply } = Route.useLoaderData()

  if (location.pathname !== `/${slug}`) {
    return <Outlet />
  }

  const catalog = projectPublicInquiryAvailability(page.catalog, admission)
  const inquiryAffordance = buildPublicInquiryAffordance(catalog, undefined, admission)
  const agentJsonUrl = `/api/businesses/${catalog.slug}`

  return (
    <AePublicShell>
      <AeProviderListingPage
        catalog={catalog}
        inquiryAffordance={inquiryAffordance}
        agentJsonUrl={agentJsonUrl}
        {...(supply === undefined ? {} : { supply })}
        {...(from === undefined ? {} : { backFrom: from })}
        {...(id === undefined ? {} : { backThreadId: id })}
      />
    </AePublicShell>
  )
}
