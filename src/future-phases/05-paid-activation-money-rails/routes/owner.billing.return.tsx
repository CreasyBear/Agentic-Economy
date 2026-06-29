import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { createParkedFileRoute } from '@/future-phases/route-helpers'

import {
  OwnerBillingReceiptList,
  OwnerBillingStatePanel,
  readOwnerBillingRouteReadback,
  summarizeOwnerBillingRoute,
  type OwnerBillingRouteReadback,
} from './owner.billing'

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
    <AePublicShell>
      <AePageHeader
        eyebrow="Provider return"
        title="Wait for recorded provider readback."
        description="Returning to Agentic Economy does not mark billing active unless the source-owned readback already proves it."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <OwnerBillingStatePanel summary={summary} />
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </section>
    </AePublicShell>
  )
}
