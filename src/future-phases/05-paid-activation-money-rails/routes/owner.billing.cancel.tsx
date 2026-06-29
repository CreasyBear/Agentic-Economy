import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { createParkedFileRoute } from '@/future-phases/route-helpers'

import {
  OwnerBillingStatePanel,
  readOwnerBillingRouteReadback,
  summarizeOwnerBillingRoute,
  type OwnerBillingRouteReadback,
} from './owner.billing'

export const Route = createParkedFileRoute<OwnerBillingRouteReadback>('/owner/billing/cancel')({
  loader: () => readOwnerBillingRouteReadback(),
  head: () => ({
    meta: [
      { title: 'Owner billing canceled | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingCancelRoute,
})

function OwnerBillingCancelRoute() {
  const readback = Route.useLoaderData()
  const summary = summarizeOwnerBillingRoute(readback, 'cancel')

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Canceled return"
        title="No active billing state was granted."
        description="A canceled return is displayed only from source-owned owner billing operation state."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <OwnerBillingStatePanel summary={summary} />
      </section>
    </AePublicShell>
  )
}
