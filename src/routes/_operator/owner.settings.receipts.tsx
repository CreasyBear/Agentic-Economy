import { createFileRoute } from '@tanstack/react-router'

import { useBillingReceipts } from '@/components/ae/settings/billing/useBillingSettings'
import { ReceiptsSettings } from '@/components/ae/settings/receipts/ReceiptsSettings'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/receipts')({
  ...operatorRouteOptions,
  head: () => ({ meta: [
    { title: 'Receipts & invoices | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: OwnerReceiptsRoute,
})

function OwnerReceiptsRoute() {
  const receipts = useBillingReceipts()
  return <ReceiptsSettings {...receipts} />
}
