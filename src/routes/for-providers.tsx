import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeSupplyLanding } from '@/components/ae/supply/AeSupplyLanding'
import { loadSupplyLandingReadback } from '@/modules/capability-supply/supply-funnel.functions'

export const Route = createFileRoute('/for-providers')({
  loader: loadSupplyLandingReadback,
  head: () => ({
    meta: [
      { title: 'Get your service in front of AI assistants | Agentic Economy' },
      { name: 'description', content: 'Publish what you do once, set your price, test it, go live, and earn when agents bring you work.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SupplyLandingRoute,
})

function SupplyLandingRoute() {
  const readback = Route.useLoaderData()
  return (
    <AePublicShell>
      <AeSupplyLanding tools={readback.tools} services={readback.services.services} />
    </AePublicShell>
  )
}
