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

export const Route = createParkedFileRoute<OwnerBillingRouteReadback>('/owner/billing/return')({
  loader: () => readOwnerBillingRouteReadback(),
  head: () => ({
    meta: [
      { title: 'Owner billing return | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingReturnRoute,
})

function OwnerBillingReturnRoute() {
  const readback = Route.useLoaderData()
  const summary = summarizeOwnerBillingRoute(readback, 'return')

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Provider return"
      title="Wait for recorded provider readback."
      description="Returning to Agentic Economy does not mark billing active unless the source-owned readback already proves it."
      currentPath="/owner/billing/return"
    >
      <div className="grid gap-6">
        <OwnerBillingStatePanel summary={summary} />
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </div>
    </AeOperatorShell>
  )
}
