import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { CallReceipt, CallUsageSummary } from '@/modules/capability-execution/call-contracts'
import type { CallReceiptView } from '@/modules/capability-execution/call-receipt-view'
import { formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'

import { machineLabel, settledPaidBuyerCharge } from './call-receipt-format'
import './ReceiptComposition.css'

export function CallMoneyFacts({ view }: Readonly<{ view: CallReceiptView }>) {
  return (
    <AeSection
      title="Money before and after the call"
      description="Buyer authorization is the pre-call ceiling. The recorded outcome is shown separately; missing facts stay missing."
    >
      <div className="arc-market arc-call-money-comparison">
        <div className="arc-call-money-group">
          <h3>Before</h3>
          <p className="arc-call-context">Quoted components and buyer authorization.</p>
          {view.receipt === undefined ? (
            <p className="arc-call-context">No public pre-call money receipt is attached to this record.</p>
          ) : <ReceiptAuthorizationFacts receipt={view.receipt} />}
        </div>
        <div className="arc-call-money-group">
          <h3>After</h3>
          <p className="arc-call-context">Recorded settlement, refund, or uncertainty.</p>
          {view.usage === undefined && view.receipt === undefined ? (
            <p className="arc-call-context">No post-call money fact is recorded yet.</p>
          ) : <ReceiptSettlementFacts usage={view.usage} receipt={view.receipt} />}
        </div>
      </div>
    </AeSection>
  )
}

function ReceiptAuthorizationFacts({ receipt }: Readonly<{ receipt: CallReceipt }>) {
  return (
    <AeFactList facts={[
      { label: "Buyer charge", value: formatDisplayAmount(receipt.buyerCharge) },
      { label: "Service fee", value: formatDisplayAmount(receipt.serviceFee) },
      { label: "Total buyer charge", value: formatDisplayAmount(receipt.totalBuyerCharge) },
      { label: "Exact buyer charge", value: formatCurrencyAmount(receipt.buyerCharge) },
      { label: "Exact service fee", value: formatCurrencyAmount(receipt.serviceFee) },
      { label: "Exact total", value: formatCurrencyAmount(receipt.totalBuyerCharge) },
    ]} />
  )
}

function ReceiptSettlementFacts({
  usage,
  receipt,
}: Readonly<{ usage: CallUsageSummary | undefined; receipt: CallReceipt | undefined }>) {
  const amount = settledPaidBuyerCharge(receipt, usage) ?? usage?.amount
  return (
    <AeFactList
      facts={[
        ...(usage === undefined ? [] : [
          { label: "Recorded outcome", value: machineLabel(usage.chargeState) },
          ...(amount === undefined ? [] : [
            { label: "Charge", value: formatDisplayAmount(amount) },
            { label: "Exact amount", value: formatCurrencyAmount(amount) },
          ]),
          { label: "Observed", value: <time dateTime={timestampIso(usage.observedAt)}>{formatUtcTimestamp(usage.observedAt)} UTC</time> },
          ...(usage.durationMs === undefined ? [] : [{ label: "Duration", value: `${usage.durationMs} ms` }]),
        ]),
        ...(receipt === undefined ? [] : [
          { label: "Receipt state", value: machineLabel(receipt.state) },
          { label: "Refund state", value: machineLabel(receipt.refundState ?? 'not recorded') },
          { label: "Loss state", value: machineLabel(receipt.lossState ?? 'not recorded') },
        ]),
      ]}
    />
  )
}
