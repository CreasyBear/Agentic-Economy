import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'
import { discoveryStatusToAeStatus, indexStatusToAeStatus, publicStatusToAeStatus, trustTierToAeStatus } from '@/lib/ui/status-presentation'
import { buildPublicInquiryAffordance, type PublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'

export const Route = createFileRoute('/$slug')({
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
          { title: 'Service page unavailable | Agentic Economy' },
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
  const { page } = Route.useLoaderData()

  if (location.pathname !== `/${slug}`) {
    return <Outlet />
  }

  if (page.kind === 'not_found') {
    return (
      <AePublicShell>
        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
          <AeEmptyState
            title="Service page unavailable"
            description="This page is not public. It may be unpublished, suppressed, or not created yet."
            action={
              <Button asChild>
                <Link to="/claim">Claim your service page</Link>
              </Button>
            }
          />
        </section>
      </AePublicShell>
    )
  }

  const catalog = page.catalog
  const inquiryAffordance = buildPublicInquiryAffordance(catalog)

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={`${catalog.suburb}, ${catalog.stateTerritory}`}
        title={catalog.name}
        description={`${catalog.category} service facts published from source-owned catalog state.`}
        actions={
          <Button asChild variant="outline">
            <Link to="/privacy/remove-business">Request removal or correction</Link>
          </Button>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:grid-cols-[minmax(0,1fr)_320px] md:px-6">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Public service facts</CardTitle>
              <CardDescription>What customers can read now.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="font-medium">Category</dt>
                  <dd className="text-muted-foreground">{catalog.category}</dd>
                </div>
                <div>
                  <dt className="font-medium">Location</dt>
                  <dd className="text-muted-foreground">
                    {catalog.suburb}, {catalog.stateTerritory}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <AeCapabilityList catalog={catalog} />
        </div>
        <aside className="grid content-start gap-4">
          <PublicInquiryAffordanceCard affordance={inquiryAffordance} />
          <Card>
            <CardHeader>
              <CardTitle>Readback</CardTitle>
              <CardDescription>Status is source-owned and not collapsed into one live label.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <AeStatusBadge status={publicStatusToAeStatus(catalog.publicStatus)} />
                <AeStatusBadge status={trustTierToAeStatus(catalog.trustTier)} />
                <AeStatusBadge status={indexStatusToAeStatus(catalog.indexStatus)} />
                <AeStatusBadge status={discoveryStatusToAeStatus(catalog.discoveryStatus)} />
                <AeStatusBadge status="not_live" />
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </AePublicShell>
  )
}

function PublicInquiryAffordanceCard({ affordance }: { affordance: PublicInquiryAffordance }) {
  if (affordance.kind === 'available') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Human inquiry</CardTitle>
          <CardDescription>{affordance.disclosure}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Your message is saved for owner review. It is not a booking, payment, or automated action.
          </p>
          <Button asChild>
            <a href={affordance.href}>{affordance.label}</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Human inquiry</CardTitle>
        <CardDescription>{affordance.reason}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Customers can read published service facts here without a first-contact form.</p>
      </CardContent>
    </Card>
  )
}
