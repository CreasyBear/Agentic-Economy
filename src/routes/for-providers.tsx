import { createFileRoute } from '@tanstack/react-router'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSupplyLanding } from '@/components/ae/supply/AeSupplyLanding'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/for-providers')({
  head: () => buildPublicPageHead({
    path: '/for-providers',
    title: 'Put your API on the market | Agentic Economy',
    description: 'Offer your API to agents. Connect a public x402 v2 endpoint, prove its payment recipient and review your Tool for publication.',
  }),
  component: SupplyLandingRoute,
})

function SupplyLandingRoute() {
  return <AePublicPage footer="none"><AeSupplyLanding /></AePublicPage>
}
