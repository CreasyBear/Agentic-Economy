import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { Button } from '@astryxdesign/core/Button'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeProviderListingPage } from '@/components/ae/listing/AeProviderListingPage'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { buildPublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'

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
    return {
      page,
      seo: buildPublicBusinessSeo({ catalog: page.catalog, options: { canonicalBaseUrl: 'https://ae.example' } }),
    }
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
  component: PublicBusinessRoute,
})

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
            description="This page is not visible right now. It may still need to be published, reviewed, or claimed by the business."
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
