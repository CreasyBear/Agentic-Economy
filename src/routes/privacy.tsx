import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePrivacyPage } from '@/components/ae/legal/privacy/AePrivacyPage'
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
    description: 'What Agentic Economy handles when you browse, call, pay for, or publish Tools and listings.',
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
      description="What the market handles when you browse, call, pay for, or publish Tools and listings."
    >
      <AePrivacyPage />
    </AePublicPage>
  )
}
