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
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner billing"
        title="Review the activation readback."
        description="This route shows the published offer or current owner operation. Provider calls stay in the authenticated server seam."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <OwnerBillingStatePanel summary={summary} />
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </section>
    </AePublicShell>
  )
}
