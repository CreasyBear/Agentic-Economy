import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import {
  AeAnswerRecordCard,
  AeBoundaryPanel,
  AeLandingBand,
  AeLandingCtaRow,
  AePublicLandingPage,
  AePublicRecordHero,
  AePublicServiceReadbacks,
  AePublicStatusPanel,
  type AeAnswerRecordField,
  type AePublicServiceReadback,
} from '@/components/ae/landing/AePublicLanding'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PublicRouteCatalogContract, PublicRouteServiceContract } from '@/modules/catalog/public'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'
import {
  capabilityStatusToAeStatus,
  firstRequestModeLabel,
  plainAvailabilityLabel,
} from '@/lib/ui/status-presentation'
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
  const primaryService = catalog.services[0]
  const answerFields = buildAnswerFields(catalog)
  const serviceReadbacks = catalog.services.map(toServiceReadback)
  const boundaryRows = buildBoundaryRows(primaryService, inquiryAffordance)

  return (
    <AePublicShell>
      <AePublicLandingPage>
        <AePublicRecordHero
          kicker={`${catalog.suburb}, ${catalog.stateTerritory}`}
          title={catalog.name}
          description={`Published ${catalog.category} details shoppers can check before they contact the business.`}
          actions={<PublicDetailActions />}
          record={
            <AeAnswerRecordCard
              eyebrow={`Business details / ${catalog.stateTerritory} / ${catalog.category}`}
              question={`"Can ${catalog.name} help with ${primaryService?.name ?? catalog.category} in ${catalog.suburb}?"`}
              statusLabel="Business-supplied details people can check"
              businessName={catalog.name}
              fields={answerFields}
              footerIcon={<span aria-hidden="true">AE</span>}
              footer="What is published, what still needs confirming, and what can happen next."
            />
          }
        />

        <AeLandingBand tone="record" grid="record" ariaLabel={`${catalog.name} published business details`}>
          <AePublicServiceReadbacks services={serviceReadbacks} />
          <AePublicStatusPanel
            title="What this page can show"
            description="These checks separate published facts from claims that still need confirmation, so visitors know what they can rely on today."
          >
            <PublicAvailabilityPill catalog={catalog} />
          </AePublicStatusPanel>
        </AeLandingBand>

        <AeLandingBand tone="boundary" grid="boundary" ariaLabel={`${catalog.name} published details, open questions, and next step`}>
          <AeBoundaryPanel rows={boundaryRows} />
          <PublicInquiryAffordanceCard affordance={inquiryAffordance} />
        </AeLandingBand>
      </AePublicLandingPage>
    </AePublicShell>
  )
}

function PublicInquiryAffordanceCard({ affordance }: { affordance: PublicInquiryAffordance }) {
  if (affordance.kind === 'available') {
    return (
      <AePublicStatusPanel title="Contact option" description={affordance.disclosure}>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          Your message goes to the business for review. This page does not promise a booking or payment.
        </p>
        <Button asChild variant="publicPrimary" className="ae-public-primary-button">
          <a href={affordance.href}>{affordance.label}</a>
        </Button>
      </AePublicStatusPanel>
    )
  }

  return (
    <AePublicStatusPanel title="Contact option" description={affordance.reason}>
      <p className="text-pretty text-sm leading-6 text-muted-foreground">Customers can still read the published business details here.</p>
    </AePublicStatusPanel>
  )
}

function PublicAvailabilityPill({ catalog }: { catalog: PublicRouteCatalogContract }) {
  const primaryService = catalog.services[0]
  const label = plainAvailabilityLabel({
    discoveryStatus: catalog.discoveryStatus,
    firstRequestMode: primaryService?.firstRequest.mode ?? 'not_available_yet',
  })
  const tone =
    catalog.discoveryStatus === 'unavailable'
      ? 'neutral'
      : catalog.discoveryStatus === 'degraded' || catalog.discoveryStatus === 'stale'
        ? 'warning'
        : 'success'

  return (
    <Badge className="ae-status-badge" data-tone={tone} variant="secondary">
      {label}
    </Badge>
  )
}

function PublicDetailActions() {
  return (
    <AeLandingCtaRow>
      <Button asChild variant="outline" className="ae-public-final-button">
        <Link to="/privacy/remove-business">Correct or remove this page</Link>
      </Button>
    </AeLandingCtaRow>
  )
}

function buildAnswerFields(catalog: PublicRouteCatalogContract): readonly AeAnswerRecordField[] {
  const primaryService = catalog.services[0]
  const nextStep = primaryService?.firstRequest.noContactReason ?? primaryService?.firstRequest.publicDisclosure ?? 'Ask the business directly.'

  return [
    { label: 'Looking for', value: primaryService?.name ?? catalog.category },
    { label: 'Provided by', value: 'Business-supplied public details' },
    { label: 'Location', value: `${catalog.suburb}, ${catalog.stateTerritory}` },
    { label: 'Published area', value: primaryService?.serviceArea ?? `${catalog.suburb}, ${catalog.stateTerritory}` },
    { label: 'Needs confirming', value: primaryService?.hoursOrUnknown ?? 'Availability needs owner confirmation' },
    { label: 'Not offered here', value: 'Booking and payment are not promised on this page' },
    { label: 'Next step', value: nextStep },
  ] as const
}

function toServiceReadback(service: PublicRouteServiceContract): AePublicServiceReadback {
  return {
    title: service.name,
    description: service.summary,
    facts: [
      { label: 'Published area', value: service.serviceArea },
      { label: 'Needs confirming', value: service.hoursOrUnknown },
      { label: 'Contact option', value: firstRequestModeLabel(service.firstRequest.mode) },
      { label: 'Next step', value: service.firstRequest.noContactReason ?? service.firstRequest.publicDisclosure },
    ],
    status: (
      <>
        {service.capabilities.map((capability, index) => (
          <AeStatusBadge
            key={`${capability.kind}:${index}`}
            status={capabilityStatusToAeStatus(capability.status)}
          />
        ))}
      </>
    ),
  }
}

function buildBoundaryRows(
  service: PublicRouteServiceContract | undefined,
  affordance: PublicInquiryAffordance
): readonly AeAnswerRecordField[] {
  const nextStep = service?.firstRequest.noContactReason ?? service?.firstRequest.publicDisclosure ?? 'Ask the business directly.'

  return [
    { label: 'Published now', value: service?.serviceArea ?? 'The listed location and category are published.' },
    { label: 'Needs confirming', value: service?.hoursOrUnknown ?? 'Current availability needs owner confirmation.' },
    { label: 'Not available here', value: 'This page does not promise booking or payment.' },
    { label: 'Next step', value: affordance.kind === 'available' ? affordance.label : nextStep },
  ] as const
}
