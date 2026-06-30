import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeProviderListingPage } from '@/components/ae/listing/AeProviderListingPage'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { buildPublicPaidActivationDisplay } from '@/modules/billing/public'
import { readPublicPaidActivationServer } from '@/modules/billing/billing.functions'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import { buildPublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'

export const Route = createFileRoute('/$slug')({
  loader: async ({ params }) => {
    const page = await readPublicBusinessPageServer({ data: { slug: params.slug } })
    if (page.kind === 'not_found') {
      return { page, seo: undefined }
    }

    const activation = await readPublicPaidActivationServer({
      data: { targetRef: readPublicCatalogActivationRef(page.catalog) },
    })

    return {
      page,
      seo: buildPublicBusinessSeo({ catalog: page.catalog, options: { canonicalBaseUrl: 'https://ae.example' } }),
      activationDisplay:
        activation.kind === 'ok' ? buildPublicPaidActivationDisplay(activation.publicActivation) : undefined,
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
  const location = useLocation()
  const { page, activationDisplay } = Route.useLoaderData()

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
            action={
              <Button asChild>
                <Link to="/claim">Claim your business page</Link>
              </Button>
            }
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
        {...(activationDisplay === undefined ? {} : { activationDisplay })}
      />
    </AePublicShell>
  )
}
