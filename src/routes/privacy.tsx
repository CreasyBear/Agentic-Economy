import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePrivacyPage } from '@/components/ae/legal/privacy/AePrivacyPage'
import { privacyIntro } from '@/components/ae/legal/privacy/privacy.contracts'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/privacy')({
  staticData: {
    nav: {
      label: 'Privacy',
      footer: { column: 'Legal', order: 0 },
    },
  },
  head: () => buildPublicPageHead({
    path: '/privacy',
    title: 'Privacy | Agentic Economy',
    description: privacyIntro,
  }),
  component: PrivacyRoute,
})

function PrivacyRoute() {
  const location = useLocation()

  if (location.pathname !== '/privacy') {
    return <Outlet />
  }

  return (
    <AePublicPage
      kind="document"
      eyebrow="Legal"
      title="Privacy"
      description={privacyIntro}
    >
      <AePrivacyPage />
    </AePublicPage>
  )
}
