import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  OwnerBillingAction,
  OwnerBillingFact,
  OwnerBillingRouteSummary,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'
import type {
  OwnerBillingOperationProjection,
  OwnerBillingReceiptProjection,
  PublicPaidActivationOffer,
} from '@/modules/billing/public'

export function OwnerBillingStatePanel({ summary }: { summary: OwnerBillingRouteSummary }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">
            {summary.kind.replaceAll('_', ' ')}
          </span>
        </div>
        <CardTitle>{summary.title}</CardTitle>
        <CardDescription>{summary.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {summary.alert === undefined ? null : (
          <Alert variant={summary.alert.variant}>
            <AlertTitle>{summary.alert.title}</AlertTitle>
            <AlertDescription>{summary.alert.description}</AlertDescription>
          </Alert>
        )}

        {summary.offer === undefined ? null : <OwnerBillingOfferDetails offer={summary.offer} />}
        {summary.operation === undefined ? null : <OwnerBillingOperationDetails operation={summary.operation} />}
        {summary.receipt === undefined ? null : <OwnerBillingReceiptDetails receipt={summary.receipt} />}

        <FactList facts={summary.facts} />

        {summary.primaryAction === undefined ? null : <OwnerBillingActionButton action={summary.primaryAction} />}
      </CardContent>
    </Card>
  )
}

export function OwnerBillingReceiptList({ receipts }: { receipts: readonly OwnerBillingReceiptProjection[] }) {
  if (receipts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No receipts recorded</CardTitle>
          <CardDescription>Receipts appear only after provider readback is stored in source-owned billing state.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {receipts.map((receipt) => (
        <Card key={receipt.id}>
          <CardHeader>
            <CardTitle>{receiptTitle(receipt.status)}</CardTitle>
            <CardDescription>{receipt.amountSummary ?? 'Amount summary unavailable'}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FactList facts={receiptFacts(receipt)} />
            <Button asChild variant="outline" size="sm">
              <a href={`/owner/billing/receipts/${receipt.id}`}>View receipt readback</a>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function OwnerBillingOfferDetails({ offer }: { offer: PublicPaidActivationOffer }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{offer.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">{offer.description}</p>
    </div>
  )
}

function OwnerBillingOperationDetails({ operation }: { operation: OwnerBillingOperationProjection }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{operation.statusLabel}</p>
      <p className="mt-1 text-sm text-muted-foreground">{operation.nextAction}</p>
    </div>
  )
}

function OwnerBillingReceiptDetails({ receipt }: { receipt: OwnerBillingReceiptProjection }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{receiptTitle(receipt.status)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{receipt.amountSummary ?? 'Amount summary unavailable'}</p>
    </div>
  )
}

function FactList({ facts }: { facts: readonly OwnerBillingFact[] }) {
  return (
    <dl className="grid gap-3 text-sm md:grid-cols-2">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-md bg-muted/40 p-3">
          <dt className="text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">
            {fact.label}
          </dt>
          <dd className="mt-1 break-words text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function OwnerBillingActionButton({ action }: { action: OwnerBillingAction }) {
  if (action.external) {
    return (
      <Button asChild className="w-fit">
        <a href={action.href} target="_blank" rel="noopener noreferrer" aria-label={`${action.label} (opens in a new tab)`}>
          {action.label}
        </a>
      </Button>
    )
  }

  return (
    <Button asChild className="w-fit">
      <a href={action.href}>{action.label}</a>
    </Button>
  )
}

function receiptFacts(receipt: OwnerBillingReceiptProjection): readonly OwnerBillingFact[] {
  return [
    { label: 'Receipt', value: receipt.id },
    { label: 'Operation', value: receipt.operationId },
    { label: 'Status', value: receipt.status },
    { label: 'Amount', value: receipt.amountSummary ?? 'Amount summary unavailable' },
    { label: 'Issued', value: new Date(receipt.issuedAt).toISOString() },
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
