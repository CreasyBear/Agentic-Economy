import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { createParkedFileRoute } from '@/future-phases/route-helpers'

import {
  OwnerBillingStatePanel,
  readOwnerBillingRouteReadback,
  summarizeOwnerBillingRoute,
  type OwnerBillingRouteReadback,
} from './owner.billing'

export const Route = createParkedFileRoute<OwnerBillingRouteReadback>('/owner/billing/redirecting')({
  loader: () => readOwnerBillingRouteReadback(),
  head: () => ({
    meta: [
      { title: 'Owner billing redirect | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingRedirectingRoute,
})

function OwnerBillingRedirectingRoute() {
  const readback = Route.useLoaderData()
  const summary = summarizeOwnerBillingRoute(readback, 'redirecting')

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Provider redirect"
        title="Continue only from a recorded operation."
        description="A redirect link appears only when source-owned owner billing state contains one for the current operation."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <OwnerBillingStatePanel summary={summary} />
      </section>
    </AePublicShell>
  )
}
