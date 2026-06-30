import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Button } from '@/components/ui/button'
import { OwnerBillingStatePanel } from '@/future-phases/05-paid-activation-money-rails/owner-billing.panels'
import { summarizeOwnerBillingRoute } from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'
import { readCurrentOwnerBillingServer } from '@/modules/billing/billing.functions'
import { ownerBillingServerToRouteReadback } from '@/routes/owner.billing'

export const Route = createFileRoute('/owner/billing/redirecting')({
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
      role="owner"
      eyebrow="Provider redirect"
      title="Continue only from a recorded operation."
      description="A redirect link appears only when source-owned owner billing state contains one for the current operation."
      currentPath="/owner/billing/redirecting"
    >
      <div className="grid gap-6">
        <OwnerBillingStatePanel summary={summary} />
        <Button asChild variant="outline" className="w-fit">
          <a href="/owner/billing">Back to billing readback</a>
        </Button>
      </div>
    </AeOperatorShell>
  )
}
