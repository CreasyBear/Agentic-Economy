import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  OwnerBillingReceiptList,
  OwnerBillingStatePanel,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.panels'
import {
  readOwnerBillingRouteReadback,
  summarizeOwnerBillingRoute,
  type OwnerBillingRouteReadback,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'
import {
  readCurrentOwnerBillingServer,
  type OwnerBillingServerResult,
} from '@/modules/billing/billing.functions'

type OwnerBillingRouteReadbackWithError = OwnerBillingRouteReadback & {
  error?: {
    code: string
    reason: string
  }
}

export const Route = createFileRoute('/owner/billing')({
  loader: () => readCurrentOwnerBillingServer(),
  head: () => ({
    meta: [
      { title: 'Owner billing | Agentic Economy' },
      { name: 'description', content: 'Your billing status and receipts on Agentic Economy.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingRoute,
})

export function ownerBillingServerToRouteReadback(result: OwnerBillingServerResult): OwnerBillingRouteReadbackWithError {
  if (result.kind === 'ok') {
    return result.readback
  }

  return {
    ...readOwnerBillingRouteReadback(),
    error: {
      code: result.code,
      reason: result.reason,
    },
  }
}

function OwnerBillingRoute() {
  const location = useLocation()
  const readback = ownerBillingServerToRouteReadback(Route.useLoaderData())
  const summary = summarizeOwnerBillingRoute(readback, 'overview')

  if (location.pathname !== '/owner/billing') {
    return <Outlet />
  }

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Owner billing"
      title="Your billing"
      description="Your plan status, receipts, and what to do next."
      currentPath="/owner/billing"
      breadcrumbs={[{ label: 'Billing', href: '/owner/billing' }]}
    >
      <div className="grid gap-6">
        {readback.error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Billing source needs attention</AlertTitle>
            <AlertDescription>{readback.error.reason}</AlertDescription>
          </Alert>
        )}
        <OwnerBillingStatePanel summary={summary} />
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </div>
    </AeOperatorShell>
  )
}
