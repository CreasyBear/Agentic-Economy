import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  readCurrentOwnerBillingReceiptServer,
  type OwnerBillingReceiptServerResult,
} from '@/modules/billing/billing.functions'

export const Route = createFileRoute('/owner/billing/receipts/$receiptId')({
  loader: async ({ params }) => {
    const receipt = await readCurrentOwnerBillingReceiptServer({ data: { receiptId: params.receiptId } })
    return { receipt, receiptId: params.receiptId }
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
  const data = Route.useLoaderData()

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Billing receipt"
      title="Receipt readback"
      description="The evidence recorded for this receipt."
      currentPath="/owner/billing/receipts"
      breadcrumbs={[
        { label: 'Billing', href: '/owner/billing' },
        { label: 'Receipt', href: '/owner/billing' },
        { label: data.receiptId },
      ]}
    >
      <ReceiptSourceStatus receipt={data.receipt as OwnerBillingReceiptServerResult} />
    </AeOperatorShell>
  )
}

function ReceiptSourceStatus({ receipt }: { receipt: OwnerBillingReceiptServerResult }) {
  if (receipt.kind === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Receipt source unavailable</CardTitle>
          <CardDescription>{receipt.reason}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source receipt evidence</CardTitle>
        <CardDescription>No raw provider payloads are shown.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <Fact label="Provider receipt" value={receipt.receipt.providerReceiptId} />
          <Fact label="Evidence refs" value={String(receipt.receipt.providerEvidenceRefs.length)} />
          <Fact label="Transition" value={receipt.receipt.paidStateTransition} />
          <Fact label="Recorded" value={new Date(receipt.receipt.recordedAt).toISOString()} />
        </dl>
        {receipt.receipt.invoiceUrl === undefined ? null : (
          <Button asChild className="w-fit">
            <a href={receipt.receipt.invoiceUrl} target="_blank" rel="noopener noreferrer">
              Open receipt
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <dt className="text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  )
}
