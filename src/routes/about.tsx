import { createFileRoute } from '@tanstack/react-router'

import { AeAboutPage } from '@/components/ae/about/AeAboutPage'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { ABOUT } from '@/content/brand-copy'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead, buildSiteJsonLd } from '@/modules/seo/public'

export const Route = createFileRoute('/about')({
  loader: () => readCanonicalBaseUrlServer(),
  head: ({ loaderData }) => buildPublicPageHead({
    path: '/about',
    title: ABOUT.metaTitle,
    description: ABOUT.metaDescription,
    ...(loaderData === undefined ? {} : { canonicalBaseUrl: loaderData }),
    ...(loaderData === undefined ? {} : { jsonLd: buildSiteJsonLd(loaderData) }),
  }),
  component: AboutRoute,
})

function AboutRoute() {
  return (
    <AePublicPage>
      <AeAboutPage />
    </AePublicPage>
  )
}
