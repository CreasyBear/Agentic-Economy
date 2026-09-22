import { Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import { projectFoundCallPurchaseStatus, type CallReceiptView } from '@/modules/capability-execution/call-receipt-view'
import { formatCurrencyAmount } from '@/modules/money/public'
import type { FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'

export function CallSummarySection({ result, receiptView: view }: Readonly<{
  result: FoundCallStatus
  receiptView: CallReceiptView
}>) {
  const purchase = projectFoundCallPurchaseStatus(result)
  const resolution = view.purchaseResolution
  const amount = receiptAmount(view)
  const released = resolution?.terminalState === 'released' || view.receipt?.refundState === 'released'
  const amountLabel = purchase.kind === 'refunded'
    ? released ? 'Released' : 'Refunded'
    : purchase.kind === 'delivered' ? 'Charged' : 'Quoted'
  const timestamp = resolution?.resolvedAt ?? view.usage?.observedAt
    ?? (view.receipt === undefined ? undefined : Date.parse(view.receipt.issuedAt))
  const agent = result.ownerContext?.agent.currentDisplayName
  const canReturnToTool = purchase.kind === 'refunded' || purchase.kind === 'failed'
  return (
    <section className="grid gap-related" aria-label="Call summary">
      <Badge className="w-fit" variant={purchase.kind === 'delivered' || purchase.kind === 'refunded'
        ? 'success' : purchase.kind === 'uncertain' ? 'warning' : 'secondary'}>{view.statusLabel}</Badge>
      <AeFactList facts={[
        ...(agent == null ? [] : [{ label: 'Agent', value: agent }]),
        ...(amount === undefined ? [] : [{ label: amountLabel, value: formatCurrencyAmount(amount) }]),
        ...(timestamp === undefined || !Number.isFinite(timestamp) ? [] : [{
          label: 'Date',
          value: <time dateTime={timestampIso(timestamp)}>{formatUtcTimestamp(timestamp)} UTC</time>,
        }]),
      ]} />
      {amount === undefined && purchase.kind !== 'pending'
        ? <p className="text-sm text-muted-foreground">The charge has not been confirmed.</p> : null}
      {canReturnToTool ? (
        <Link to="/tools/$toolRef" params={{ toolRef: result.toolRef }} className={buttonVariants({ className: 'min-h-touch w-fit' })}>
          View Tool
        </Link>
      ) : null}
    </section>
  )
}

function receiptAmount(view: CallReceiptView) {
  if (view.purchaseResolution !== undefined) return view.purchaseResolution.considerationAmount
  if (view.receipt?.commercialModel === 'account_aud') return view.receipt.totalBuyerCharge
  if (view.receipt?.commercialModel === 'seller_canary_x402') return view.receipt.totalBuyerAuthorization
  return view.usage?.chargeState === 'outcome_unknown' ? undefined : view.usage?.amount
}
