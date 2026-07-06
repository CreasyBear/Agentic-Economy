import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Skeleton } from '@astryxdesign/core/Skeleton'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeProviderListingPage } from '@/components/ae/listing/AeProviderListingPage'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { buildPublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'
import { serializeJsonLd } from '@/modules/seo/public'
import { buildPublicBusinessRouteSeo } from '@/modules/seo/public-route'

type ProviderListingSearch = {
  from?: 'thread' | 'registry'
  id?: string
}

export const Route = createFileRoute('/$slug')({
  validateSearch: (search: Record<string, unknown>): ProviderListingSearch => {
    const from = search.from === 'thread' || search.from === 'registry' ? search.from : undefined
    const id = typeof search.id === 'string' && search.id.trim().length > 0 ? search.id.trim() : undefined
    return {
      ...(from === undefined ? {} : { from }),
      ...(id === undefined ? {} : { id }),
    }
  },
  loader: async ({ params }) => {
    const page = await readPublicBusinessPageServer({ data: { slug: params.slug } })
    if (page.kind === 'not_found') {
      return { page, seo: undefined }
    }
    const seo = buildPublicBusinessRouteSeo(page.catalog, await readCanonicalBaseUrlServer())
    return { page, seo }
  },
  head: ({ loaderData }) => {
    if (loaderData?.seo === undefined) {
      return {
        meta: [
          { title: 'Business page unavailable | Agentic Economy' },
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
  component: PublicBusinessRoute,
})


function ProviderListingPending() {
  return (
    <AePublicShell>
      <article className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 md:px-6 md:py-10" aria-busy="true" aria-label="Loading listing">
        <nav aria-label="Return to your previous view">
          <Skeleton height="2.25rem" width="10rem" index={0} />
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="grid gap-8">
            <Card padding={6} className="overflow-hidden" aria-label="Loading listing header">
              <VStack gap={5}>
                <HStack vAlign="center" gap={2} wrap="wrap">
                  <Skeleton height="1.5rem" width="1.5rem" index={1} />
                  <Skeleton height="1rem" width="12rem" index={2} />
                </HStack>

                <VStack gap={2}>
                  <Skeleton height="4rem" width="82%" index={3} />
                  <Skeleton height="1.75rem" width="44%" index={4} />
                </VStack>

                <HStack vAlign="center" gap={3} wrap="wrap">
                  <Skeleton height="1.75rem" width="8rem" index={5} />
                  <Skeleton height="1.75rem" width="10rem" index={6} />
                  <Skeleton height="1rem" width="12rem" index={7} />
                </HStack>

                <Skeleton height="3rem" width="70%" index={8} />
              </VStack>
            </Card>

            <Card padding={5} className="grid gap-4" aria-label="Loading listing photos">
              <Grid columns={{ minWidth: 220 }} gap={4}>
                <Skeleton height="13rem" width="100%" index={9} />
                <Skeleton height="13rem" width="100%" index={10} />
                <Skeleton height="13rem" width="100%" index={11} />
              </Grid>
            </Card>

            <Grid columns={{ minWidth: 300 }} gap={4}>
              <Card padding={5} aria-label="Loading reach-out steps">
                <VStack gap={3}>
                  <Skeleton height="1.5rem" width="14rem" index={12} />
                  {Array.from({ length: 3 }, (_, index) => (
                    <HStack key={index} gap={3} vAlign="start">
                      <Skeleton height="1rem" width="1rem" index={13 + index} />
                      <VStack gap={1}>
                        <Skeleton height="1rem" width="11rem" index={16 + index} />
                        <Skeleton height="0.75rem" width="13rem" index={19 + index} />
                        <Skeleton height="1rem" width="100%" index={22 + index} />
                      </VStack>
                    </HStack>
                  ))}
                </VStack>
              </Card>

              <Card padding={5} aria-label="Loading source dates">
                <VStack gap={3}>
                  <Skeleton height="1.5rem" width="9rem" index={25} />
                  <Skeleton height="2.25rem" width="15rem" index={26} />
                  <Skeleton height="2.25rem" width="14rem" index={27} />
                </VStack>
              </Card>
            </Grid>

            <Card padding={6} className="grid gap-6" aria-label="Loading listing details">
              <VStack gap={1}>
                <Skeleton height="1.5rem" width="10rem" index={28} />
                <Skeleton height="1rem" width="18rem" index={29} />
              </VStack>
              {Array.from({ length: 3 }, (_, index) => (
                <VStack key={index} gap={3}>
                  <Skeleton height="0.75rem" width="9rem" index={30 + index} />
                  <Grid columns={{ minWidth: 240 }} gap={4}>
                    <Skeleton height="5rem" width="100%" index={33 + index} />
                    <Skeleton height="5rem" width="100%" index={36 + index} />
                  </Grid>
                </VStack>
              ))}
            </Card>
          </div>

          <aside className="grid content-start gap-6 lg:sticky lg:top-20" aria-label="Loading actions for this business">
            <Card padding={5}>
              <VStack gap={4}>
                <VStack gap={2}>
                  <Skeleton height="1.5rem" width="13rem" index={39} />
                  <Skeleton height="3rem" width="100%" index={40} />
                </VStack>
                <Skeleton height="2.75rem" width="100%" index={41} />
                <Skeleton height="3.5rem" width="100%" index={42} />
              </VStack>
            </Card>

            <Card padding={5} className="bg-surface" aria-label="Loading assistant details">
              <VStack gap={3}>
                <Skeleton height="1.5rem" width="9rem" index={43} />
                <Skeleton height="2.5rem" width="100%" index={44} />
                <Skeleton height="2.25rem" width="12rem" index={45} />
              </VStack>
            </Card>

            <Skeleton height="1rem" width="11rem" index={46} />
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
        <AeEmptyState
          title="This listing didn't load"
          description="Try the page again, or go back to the registry to compare listed businesses."
          action={
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button label="Try again" variant="primary" href={pathname} />
              <Button label="Back to registry" variant="secondary" href="/registry?q=&limit=10" />
            </div>
          }
        />
      </section>
    </AePublicShell>
  )
}

function PublicBusinessRoute() {
  const { slug } = Route.useParams()
  const { from, id } = Route.useSearch()
  const location = useLocation()
  const { page } = Route.useLoaderData()

  if (location.pathname !== `/${slug}`) {
    return <Outlet />
  }

  if (page.kind === 'not_found') {
    return (
      <AePublicShell>
        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
          <AeEmptyState
            title="Business page unavailable"
            description="This page is not visible right now. The business may need to claim or review it."
            action={<Button label="Claim your business page" variant="primary" href="/claim" />}
          />
        </section>
      </AePublicShell>
    )
  }

  const catalog = page.catalog
  const inquiryAffordance = buildPublicInquiryAffordance(catalog)
  const agentJsonUrl = `/api/businesses/${catalog.slug}`

  return (
    <AePublicShell>
      <AeProviderListingPage
        catalog={catalog}
        inquiryAffordance={inquiryAffordance}
        agentJsonUrl={agentJsonUrl}
        {...(from === undefined ? {} : { backFrom: from })}
        {...(id === undefined ? {} : { backThreadId: id })}
      />
    </AePublicShell>
  )
}
