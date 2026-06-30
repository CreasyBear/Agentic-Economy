import { createParkedFileRoute } from '@/future-phases/route-helpers'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { OwnerBillingStatePanel } from '@/future-phases/05-paid-activation-money-rails/owner-billing.panels'
import {
  readOwnerBillingRouteReadback,
  summarizeOwnerBillingRoute,
  type OwnerBillingRouteReadback,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'

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
    <AeOperatorShell
      role="owner"
      eyebrow="Canceled return"
      title="No active billing state was granted."
      description="A canceled return is displayed only from source-owned owner billing operation state."
      currentPath="/owner/billing/cancel"
    >
      <div className="grid gap-6">
        <OwnerBillingStatePanel summary={summary} />
      </div>
    </AeOperatorShell>
  )
}
