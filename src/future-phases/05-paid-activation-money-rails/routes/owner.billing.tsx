import { createParkedFileRoute } from '@/future-phases/route-helpers'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  OwnerBillingReceiptList,
  OwnerBillingStatePanel,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.panels'
import {
  readOwnerBillingRouteReadback,
  summarizeOwnerBillingRoute,
  type OwnerBillingRouteReadback,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'

export const Route = createParkedFileRoute<OwnerBillingRouteReadback>('/owner/billing')({
  loader: () => readOwnerBillingRouteReadback(),
  head: () => ({
    meta: [
      { title: 'Owner billing readback | Agentic Economy' },
      { name: 'description', content: 'Owner billing states from source-owned activation readbacks.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingRoute,
})

function OwnerBillingRoute() {
  const readback = Route.useLoaderData()
  const summary = summarizeOwnerBillingRoute(readback, 'overview')

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Owner billing"
      title="Read billing state before taking action."
      description="The owner view separates offer availability, provider redirects, returns, receipts, and unavailable states without granting access from unverified provider status."
      currentPath="/owner/billing"
    >
      <div className="grid gap-6">
        <OwnerBillingStatePanel summary={summary} />
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </div>
    </AeOperatorShell>
  )
}
