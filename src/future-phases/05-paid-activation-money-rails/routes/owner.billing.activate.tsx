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

export const Route = createParkedFileRoute<OwnerBillingRouteReadback>('/owner/billing/activate')({
  loader: () => readOwnerBillingRouteReadback(),
  head: () => ({
    meta: [
      { title: 'Owner billing activation | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingActivateRoute,
})

function OwnerBillingActivateRoute() {
  const readback = Route.useLoaderData()
  const summary = summarizeOwnerBillingRoute(readback, 'activate')

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Owner billing"
      title="Review the activation readback."
      description="This route shows the published offer or current owner operation. Provider calls stay in the authenticated server seam."
      currentPath="/owner/billing/activate"
    >
      <div className="grid gap-6">
        <OwnerBillingStatePanel summary={summary} />
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </div>
    </AeOperatorShell>
  )
}
