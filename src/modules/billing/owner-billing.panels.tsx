import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { formatTimestamp } from '@/lib/ui/format-time'
import type {
  OwnerBillingAction,
  OwnerBillingFact,
  OwnerBillingRouteSummary,
} from '@/modules/billing/owner-billing.readback'
import type {
  OwnerBillingOperationProjection,
  OwnerBillingReceiptProjection,
  PublicPaidActivationOffer,
} from '@/modules/billing/public'

export function OwnerBillingStatePanel({ summary }: { summary: OwnerBillingRouteSummary }) {
  return (
    <Card padding={3}>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-wide text-secondary">
            {summary.kind.replaceAll('_', ' ')}
          </span>
        </div>
        <Text as="h2" type="large" weight="semibold">
          {summary.title}
        </Text>
        <Text as="p" type="supporting">
          {summary.description}
        </Text>
      </div>
      <div className="mt-5 grid gap-5">
        {summary.alert === undefined ? null : (
          <Banner
            status={summary.alert.variant === 'destructive' ? 'error' : 'info'}
            title={summary.alert.title}
            description={summary.alert.description}
          />
        )}

        {summary.offer === undefined ? null : <OwnerBillingOfferDetails offer={summary.offer} />}
        {summary.operation === undefined ? null : <OwnerBillingOperationDetails operation={summary.operation} />}
        {summary.receipt === undefined ? null : <OwnerBillingReceiptDetails receipt={summary.receipt} />}

        <FactList facts={summary.facts} />

        {summary.primaryAction === undefined ? null : <OwnerBillingActionButton action={summary.primaryAction} />}
      </div>
    </Card>
  )
}

export function OwnerBillingReceiptList({ receipts }: { receipts: readonly OwnerBillingReceiptProjection[] }) {
  return (
    <AeOperatorQueueList
      rows={receipts.map((receipt) => ({
        id: receipt.id,
        href: `/owner/billing/receipts/${receipt.id}`,
        badges: [{ label: receiptTitle(receipt.status), variant: 'outline' as const }],
        title: receiptTitle(receipt.status),
        description: receipt.amountSummary ?? 'Amount summary unavailable',
        facts: receiptFacts(receipt).map((fact) => ({ label: fact.label, value: fact.value })),
        actions: [
          {
            label: 'View receipt',
            href: `/owner/billing/receipts/${receipt.id}`,
            variant: 'secondary',
          },
        ],
      }))}
      emptyTitle="No receipts recorded"
      emptyDescription="Receipts appear once the payment provider confirms them."
    />
  )
}

function OwnerBillingOfferDetails({ offer }: { offer: PublicPaidActivationOffer }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{offer.name}</p>
      <p className="mt-1 text-sm text-secondary">{offer.description}</p>
    </div>
  )
}

function OwnerBillingOperationDetails({ operation }: { operation: OwnerBillingOperationProjection }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{operation.statusLabel}</p>
      <p className="mt-1 text-sm text-secondary">{operation.nextAction}</p>
    </div>
  )
}

function OwnerBillingReceiptDetails({ receipt }: { receipt: OwnerBillingReceiptProjection }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{receiptTitle(receipt.status)}</p>
      <p className="mt-1 text-sm text-secondary">{receipt.amountSummary ?? 'Amount summary unavailable'}</p>
    </div>
  )
}

function FactList({ facts }: { facts: readonly OwnerBillingFact[] }) {
  return <AeOperatorFactGrid facts={facts} columns={2} />
}

function OwnerBillingActionButton({ action }: { action: OwnerBillingAction }) {
  if (action.external) {
    return (
      <Button
        label={action.label}
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${action.label} (opens in a new tab)`}
        className="w-fit"
      />
    )
  }

  return (
    <Button label={action.label} href={action.href} className="w-fit" />
  )
}

function receiptFacts(receipt: OwnerBillingReceiptProjection): readonly OwnerBillingFact[] {
  return [
    { label: 'Receipt', value: receipt.id },
    { label: 'Operation', value: receipt.operationId },
    { label: 'Status', value: receipt.status },
    { label: 'Amount', value: receipt.amountSummary ?? 'Amount summary unavailable' },
    { label: 'Issued', value: formatTimestamp(receipt.issuedAt) },
  ]
}

function receiptTitle(status: OwnerBillingReceiptProjection['status']): string {
  switch (status) {
    case 'paid':
      return 'Paid receipt'
    case 'refunded':
      return 'Refunded receipt'
    case 'disputed':
      return 'Disputed receipt'
    case 'chargeback':
      return 'Chargeback receipt'
  }
}
