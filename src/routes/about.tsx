import { createFileRoute } from '@tanstack/react-router'

import { AeAboutPage } from '@/components/ae/about/AeAboutPage'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { ABOUT } from '@/content/brand-copy'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead, buildSiteJsonLd } from '@/modules/seo/public'

export const Route = createFileRoute('/about')({
  loader: () => readCanonicalBaseUrlServer(),
  head: ({ loaderData }) => buildPublicPageHead({
    path: '/about',
    title: ABOUT.metaTitle,
    description: ABOUT.metaDescription,
    canonicalBaseUrl: loaderData,
    jsonLd: loaderData === undefined ? undefined : buildSiteJsonLd(loaderData),
  }),
  component: AboutRoute,
})

function AboutRoute() {
  return (
    <AePublicShell>
      <AeAboutPage />
    </AePublicShell>
  )
}
