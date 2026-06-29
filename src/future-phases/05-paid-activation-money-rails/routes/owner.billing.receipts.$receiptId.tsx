import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { createParkedFileRoute } from '@/future-phases/route-helpers'

import {
  OwnerBillingStatePanel,
  readOwnerBillingRouteReadback,
  selectOwnerBillingReceiptState,
  type OwnerBillingRouteSummary,
} from './owner.billing'

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
    <AePublicShell>
      <AePageHeader
        eyebrow="Billing receipt"
        title="Receipt readback"
        description="Receipts are shown only when they exist in source-owned billing state for this owner operation."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <OwnerBillingStatePanel summary={summary} />
      </section>
    </AePublicShell>
  )
}
