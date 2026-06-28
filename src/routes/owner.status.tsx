import { createFileRoute } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { getDefaultPublicOwnerStatusReadback } from '@/modules/catalog/public'

export const Route = createFileRoute('/owner/status')({
  loader: () => getDefaultPublicOwnerStatusReadback(),
  head: () => ({
    meta: [
      { title: 'Owner status readback | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerStatusRoute,
})

function OwnerStatusRoute() {
  const readback = Route.useLoaderData()

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner readback"
        title="Service page status"
        description="Public page, index, discovery, trust, and capability states stay separate so unavailable work is visible."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <AeStatusCard readback={readback} />
        <AeCapabilityList catalog={readback.catalog} />
      </section>
    </AePublicShell>
  )
}
