import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { CallReceipt, CallUsageSummary } from '@/modules/capability-execution/call-contracts'
import type { CallReceiptView } from '@/modules/capability-execution/call-receipt-view'
import { formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'

import { machineLabel } from './call-receipt-format'

export function CallMoneyFacts({ view }: Readonly<{ view: CallReceiptView }>) {
  return (
    <AeSection
      title="Money before and after the call"
      description="Buyer authorization is the pre-call ceiling. The recorded outcome is shown separately; missing facts stay missing."
    >
      <div className="grid gap-section">
        <div className="grid gap-related">
          <h3 className="text-sm font-medium text-foreground">Before</h3>
          <p className="text-sm text-muted-foreground">Quoted components and buyer authorization.</p>
          {view.receipt === undefined ? (
            <p className="text-sm text-muted-foreground">No public pre-call money receipt is attached to this record.</p>
          ) : <ReceiptAuthorizationFacts receipt={view.receipt} />}
        </div>
        <div className="grid gap-related">
          <h3 className="text-sm font-medium text-foreground">After</h3>
          <p className="text-sm text-muted-foreground">Recorded settlement, refund, or uncertainty.</p>
          {view.usage === undefined && view.receipt === undefined ? (
            <p className="text-sm text-muted-foreground">No post-call money fact is recorded yet.</p>
          ) : <ReceiptSettlementFacts usage={view.usage} receipt={view.receipt} />}
        </div>
      </div>
    </AeSection>
  )
}

function ReceiptAuthorizationFacts({ receipt }: Readonly<{ receipt: CallReceipt }>) {
  const commercialFacts = receipt.commercialModel === 'account_aud'
    ? [
        { label: "Buyer charge", value: formatDisplayAmount(receipt.buyerCharge) },
        { label: "Service fee", value: formatDisplayAmount(receipt.serviceFee) },
        { label: "Total buyer charge", value: formatDisplayAmount(receipt.totalBuyerCharge) },
        { label: "Exact buyer charge", value: formatCurrencyAmount(receipt.buyerCharge) },
        { label: "Exact service fee", value: formatCurrencyAmount(receipt.serviceFee) },
        { label: "Exact total", value: formatCurrencyAmount(receipt.totalBuyerCharge) },
      ]
    : [
        { label: "Provider quote (source)", value: formatCurrencyAmount(receipt.providerQuotedAmount) },
        { label: "Agentic Economy fee", value: formatDisplayAmount(receipt.agenticEconomyFee) },
        { label: "Buyer authorized up to", value: formatDisplayAmount(receipt.totalBuyerAuthorization) },
        { label: "Exact authorization", value: formatCurrencyAmount(receipt.totalBuyerAuthorization) },
      ]
  return (
    <AeFactList facts={commercialFacts} />
  )
}

function ReceiptSettlementFacts({
  usage,
  receipt,
}: Readonly<{ usage: CallUsageSummary | undefined; receipt: CallReceipt | undefined }>) {
  return (
    <AeFactList
      facts={[
        ...(usage === undefined ? [] : [
          { label: "Recorded outcome", value: machineLabel(usage.chargeState) },
          { label: "Charge", value: formatDisplayAmount(usage.amount) },
          { label: "Exact amount", value: formatCurrencyAmount(usage.amount) },
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
