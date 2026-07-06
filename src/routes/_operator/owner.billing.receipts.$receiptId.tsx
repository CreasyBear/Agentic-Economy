import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import {
  readCurrentOwnerBillingReceiptServer,
  type OwnerBillingReceiptServerResult,
} from '@/modules/billing/billing.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'

export const Route = createFileRoute('/_operator/owner/billing/receipts/$receiptId')({
  ...operatorRouteOptions,
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
      operatorRole="owner"
      eyebrow="Billing receipt"
      title="Receipt"
      description="The evidence recorded for this receipt."
      currentPath={`/owner/billing/receipts/${data.receiptId}`}
    >
      <ReceiptSourceStatus receipt={data.receipt as OwnerBillingReceiptServerResult} />
    </AeOperatorShell>
  )
}

function ReceiptSourceStatus({ receipt }: { receipt: OwnerBillingReceiptServerResult }) {
  if (receipt.kind === 'error') {
    return (
      <Card padding={3}>
        <div className="grid gap-1.5">
          <Text as="div" type="large" weight="semibold" color="primary" display="block">Receipt source unavailable</Text>
          <Text as="div" type="supporting" color="secondary" display="block">{receipt.reason}</Text>
        </div>
      </Card>
    )
  }

  return (
    <Card padding={3}>
      <div className="grid gap-1.5">
        <Text as="div" type="large" weight="semibold" color="primary" display="block">Source receipt evidence</Text>
        <Text as="div" type="supporting" color="secondary" display="block">No raw provider payloads are shown.</Text>
      </div>
      <div className="grid gap-4">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <Fact label="Provider receipt" value={receipt.receipt.providerReceiptId} />
          <Fact label="Evidence refs" value={String(receipt.receipt.providerEvidenceRefs.length)} />
          <Fact label="Transition" value={receipt.receipt.paidStateTransition} />
          <Fact
            label="Recorded"
            value={
              <time dateTime={timestampIso(receipt.receipt.recordedAt)} data-numeric>
                {formatTimestamp(receipt.receipt.recordedAt)}
              </time>
            }
          />
        </dl>
        {receipt.receipt.invoiceUrl === undefined ? null : (
          <Button
            href={receipt.receipt.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit"
            label="Open receipt"
          />
        )}
      </div>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  )
}
