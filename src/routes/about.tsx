import { createFileRoute } from '@tanstack/react-router'

import { AeAboutPage } from '@/components/ae/about/AeAboutPage'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { ABOUT } from '@/content/brand-copy'
import { availabilityStatement } from '@/content/availability-copy'
import { readAvailabilityServer } from '@/lib/server/availability.functions'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead, buildSiteJsonLd } from '@/modules/seo/public'

export const Route = createFileRoute('/about')({
  loader: async () => {
    const [canonicalBaseUrl, paidCalls] = await Promise.all([readCanonicalBaseUrlServer(), readAvailabilityServer()])
    return { canonicalBaseUrl, availability: availabilityStatement(paidCalls) }
  },
  head: ({ loaderData }) => buildPublicPageHead({
    path: '/about',
    title: ABOUT.metaTitle,
    description: ABOUT.metaDescription,
    ...(loaderData === undefined ? {} : { canonicalBaseUrl: loaderData.canonicalBaseUrl }),
    ...(loaderData === undefined ? {} : { jsonLd: buildSiteJsonLd(loaderData.canonicalBaseUrl) }),
  }),
  component: AboutRoute,
})

function AboutRoute() {
  const { availability } = Route.useLoaderData()
  return (
    <AePublicPage>
      <AeAboutPage availability={availability} />
    </AePublicPage>
  )
}
