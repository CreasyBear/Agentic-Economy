import { createFileRoute } from '@tanstack/react-router'

import { Button } from '@astryxdesign/core/Button'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { OwnerBillingStatePanel } from '@/modules/billing/owner-billing.panels'
import { summarizeOwnerBillingRoute } from '@/modules/billing/owner-billing.readback'
import { readCurrentOwnerBillingServer } from '@/modules/billing/billing.functions'
import { ownerBillingServerToRouteReadback } from '@/routes/_operator/owner.billing'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/billing/redirecting')({
  ...operatorRouteOptions,
  loader: () => readCurrentOwnerBillingServer(),
  head: () => ({
    meta: [
      { title: 'Owner billing redirect | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingRedirectingRoute,
})

function OwnerBillingRedirectingRoute() {
  const readback = ownerBillingServerToRouteReadback(Route.useLoaderData())
  const summary = summarizeOwnerBillingRoute(readback, 'redirecting')

  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow="Provider redirect"
      title="Continue to the payment provider"
      description="If a plan setup is waiting for you, continue here. Otherwise, return to billing."
      currentPath="/owner/billing/redirecting"
    >
      <div className="grid gap-6">
        <OwnerBillingStatePanel summary={summary} />
        <Button href="/owner/billing" variant="secondary" className="w-fit" label="Back to billing" />
      </div>
    </AeOperatorShell>
  )
}
