import { createFileRoute } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeTrustPage } from '@/components/ae/legal/trust/AeTrustPage'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/trust')({
  head: () => buildPublicPageHead({
    path: '/trust',
    title: 'Trust centre | Agentic Economy',
    description: 'How Agentic Economy handles credit, Tool results, Provider selection, security, data and support.',
  }),
  component: TrustRoute,
})

function TrustRoute() {
  return <AePublicPage><AeTrustPage /></AePublicPage>
}
