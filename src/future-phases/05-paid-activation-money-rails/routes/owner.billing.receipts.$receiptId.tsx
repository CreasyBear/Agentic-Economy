import { createParkedFileRoute } from '@/future-phases/route-helpers'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { OwnerBillingStatePanel } from '@/future-phases/05-paid-activation-money-rails/owner-billing.panels'
import {
  readOwnerBillingRouteReadback,
  selectOwnerBillingReceiptState,
  type OwnerBillingRouteReadback,
  type OwnerBillingRouteSummary,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'

export const Route = createParkedFileRoute<OwnerBillingRouteSummary, { receiptId: string }>('/owner/billing/receipts/$receiptId')({
  loader: ({ params }) => {
    const readback = readOwnerBillingRouteReadback()

    return selectOwnerBillingReceiptState(readback, params.receiptId)
  },
  head: () => ({
    meta: [
      { title: 'Owner billing receipt | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingReceiptRoute,
})

function OwnerBillingReceiptRoute() {
  const summary = Route.useLoaderData()

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Billing receipt"
      title="Receipt readback"
      description="Receipts are shown only when they exist in source-owned billing state for this owner operation."
      currentPath="/owner/billing/receipts"
    >
      <div className="grid gap-6">
        <OwnerBillingStatePanel summary={summary} />
      </div>
    </AeOperatorShell>
  )
}
