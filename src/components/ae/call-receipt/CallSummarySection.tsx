import { CallObjectLinks } from '@/components/ae/shared/CallObjectLinks'
import { CallOutcome } from '@/components/ae/shared/CallOutcome'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { projectFoundCallPurchaseStatus, type CallReceiptView } from '@/modules/capability-execution/call-receipt-view'
import type { FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'
import { settledPaidBuyerCharge } from './call-receipt-format'
import './ReceiptComposition.css'

export function CallSummarySection({ result, receiptView: view }: Readonly<{
  result: FoundCallStatus
  receiptView: CallReceiptView
}>) {
  const purchase = projectFoundCallPurchaseStatus(result)
  const resolution = view.purchaseResolution
  const amount = receiptAmount(view, purchase.kind)
  const released = resolution?.terminalState === 'released' || view.receipt?.refundState === 'released'
  const amountLabel = purchase.kind === 'refunded'
    ? released ? 'Released' : 'Refunded'
    : purchase.kind === 'delivered' ? 'Charged' : 'Amount on record'
  const timestamp = resolution?.resolvedAt ?? view.usage?.observedAt
    ?? (view.receipt === undefined ? undefined : Date.parse(view.receipt.issuedAt))
  const agent = result.ownerContext?.agent.currentDisplayName
  return (
    <section className="arc-market arc-call-summary" aria-label="Call summary">
      <CallOutcome view={{
        callRef: result.callRef,
        label: view.statusLabel,
        detail: view.statusDetail,
        purchaseKind: purchase.kind,
        payment: paymentFactLabel(resolution?.paymentState),
        delivery: deliveryFactLabel(resolution?.deliveryState),
        ...(amount === undefined ? {} : { amount, amountLabel }),
      }} />
      <AeFactList facts={[
        ...(agent == null ? [] : [{ label: 'Agent', value: agent }]),
        ...(timestamp === undefined || !Number.isFinite(timestamp) ? [] : [{
          label: 'Date',
          value: <time dateTime={timestampIso(timestamp)}>{formatTimestamp(timestamp, 'UTC')} UTC</time>,
        }]),
      ]} />
      {amount === undefined && purchase.kind !== 'pending'
        ? <p className="text-sm text-muted-foreground">The charge has not been confirmed.</p> : null}
      {result.state === 'retryable' ? null : <CallObjectLinks view={{ callRef: result.callRef, toolRef: result.toolRef, provider: { kind: 'absent' } }} />}
    </section>
  )
}

function deliveryFactLabel(state: 'delivered' | 'not_delivered' | 'unknown' | undefined): string {
  if (state === 'delivered') return 'Delivered'
  if (state === 'not_delivered') return 'Not delivered'
  return 'Unknown'
}

function paymentFactLabel(
  state: 'settled' | 'released' | 'unknown' | 'not_applicable' | undefined,
): string {
  if (state === 'settled') return 'Settled'
  if (state === 'released') return 'Released'
  if (state === 'not_applicable') return 'Not applicable'
  return 'Unknown'
}

function receiptAmount(view: CallReceiptView, purchaseKind: ReturnType<typeof projectFoundCallPurchaseStatus>['kind']) {
  if (purchaseKind === 'delivered') {
    const charge = settledPaidBuyerCharge(view.receipt, view.usage)
    if (charge !== undefined) return charge
  }
  if (view.purchaseResolution !== undefined) return view.purchaseResolution.considerationAmount
  if (view.receipt?.commercialModel === 'account_aud') return view.receipt.totalBuyerCharge
  return view.usage?.chargeState === 'outcome_unknown' ? undefined : view.usage?.amount
}
