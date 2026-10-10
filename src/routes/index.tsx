import { createFileRoute } from '@tanstack/react-router'

import { AeLanding, LandingError, LandingPending } from '@/components/ae/home/AeLanding'
import { LANDING_COPY } from '@/components/ae/home/landing-content'
import { readLandingServer } from '@/components/ae/home/landing.functions'
import { degrade } from '@/lib/observability/degrade'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead, buildSiteJsonLd } from '@/modules/seo/public'

export const Route = createFileRoute('/')({
  loader: async () => {
    // The directory read is deferred: the hero paints at once and the rows stream in behind it.
    const data = readLandingServer()
    const canonicalBaseUrl = await readCanonicalBaseUrlServer()
      .catch(cause => degrade(cause, undefined, { site: 'landingCanonicalUrl', reason: 'source_unavailable' }))
    return { data, canonicalBaseUrl }
  },
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  head: ({ loaderData }) =>
    buildPublicPageHead({
      path: '/',
      title: LANDING_COPY.metaTitle,
      description: LANDING_COPY.metaDescription,
      ...(loaderData?.canonicalBaseUrl === undefined ? {} : {
        canonicalBaseUrl: loaderData.canonicalBaseUrl,
        jsonLd: buildSiteJsonLd(loaderData.canonicalBaseUrl),
      }),
    }),
  pendingComponent: LandingPending,
  errorComponent: LandingError,
  component: LandingRoute,
})

function LandingRoute() {
  const { data, canonicalBaseUrl } = Route.useLoaderData()
  return <AeLanding data={data} canonicalBaseUrl={canonicalBaseUrl} />
}
