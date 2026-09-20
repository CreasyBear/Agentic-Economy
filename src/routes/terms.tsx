import { createFileRoute } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeTermsPage } from '@/components/ae/legal/terms/AeTermsPage'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/terms')({
  staticData: {
    nav: {
      label: 'Terms',
      footer: { column: 'Legal', order: 1 },
    },
  },
  head: () => buildPublicPageHead({
    path: '/terms',
    title: 'Terms | Agentic Economy',
    description: 'Plain-language terms for finding, comparing, paying for, and calling Agentic Economy Tools.',
  }),
  component: TermsRoute,
})

function TermsRoute() {
  return (
    <AePublicPage
      kind="document"
      eyebrow="Legal"
      title="Terms"
      description="Use Agentic Economy to find, inspect, pay for, and call published Tools."
    >
      <AeTermsPage />
    </AePublicPage>
  )
}
