import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Banner } from '@astryxdesign/core/Banner'
import {
  OwnerBillingReceiptList,
  OwnerBillingStatePanel,
} from '@/modules/billing/owner-billing.panels'
import {
  readOwnerBillingRouteReadback,
  summarizeOwnerBillingRoute,
  type OwnerBillingRouteReadback,
} from '@/modules/billing/owner-billing.readback'
import {
  readCurrentOwnerBillingServer,
  type OwnerBillingServerResult,
} from '@/modules/billing/billing.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

type OwnerBillingRouteReadbackWithError = OwnerBillingRouteReadback & {
  error?: {
    code: string
    reason: string
  }
}

export const Route = createFileRoute('/_operator/owner/billing')({
  ...operatorRouteOptions,
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
      operatorRole="owner"
      eyebrow="Owner billing"
      title="Your billing"
      description="Your plan status, receipts, and what to do next."
      currentPath="/owner/billing"
    >
      <div className="grid gap-6">
        {readback.error === undefined ? null : (
          <Banner
            status="error"
            title="Billing source needs attention"
            description={readback.error.reason}
          />
        )}
        <OwnerBillingStatePanel summary={summary} />
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </div>
    </AeOperatorShell>
  )
}
