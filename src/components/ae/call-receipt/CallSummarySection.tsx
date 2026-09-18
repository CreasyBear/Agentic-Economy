import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { Badge } from '@/components/ui/badge'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import {
  outcomeRecordLabel,
  purchaseStatusLabel,
  type CallReceiptView,
} from '@/modules/capability-execution/call-receipt-view'
import { formatCurrencyAmount } from '@/modules/money/public'

import type { FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'

export function CallSummarySection({
  result,
  receiptView,
}: Readonly<{ result: FoundCallStatus; receiptView: CallReceiptView }>) {
  return (
    <section className="grid gap-related" aria-labelledby="call-summary-title">
      <div className="flex flex-wrap gap-intra">
        <Badge variant={receiptView.complete ? 'success' : receiptView.issue === undefined ? 'secondary' : 'warning'}>{receiptView.statusLabel}</Badge>
      </div>
      <div className="grid gap-intra">
        <h2 id="call-summary-title" className="text-xl font-semibold tracking-tight text-foreground">Call summary</h2>
        <p className="text-sm text-muted-foreground">The outcome and buyer-facing money facts for this exact Call.</p>
      </div>
      <AeFactList
        facts={[
          ...ownerCallIdentityFacts(result),
          { label: "Buyer amount", value: buyerAmountLabel(receiptView) },
          { label: "Recorded", value: recordedAtLabel(receiptView) },
          { label: "Purchase status", value: purchaseStatusLabel(result) },
          { label: "Outcome record", value: outcomeRecordLabel(result) },
        ]}
      />
    </section>
  )
}

function buyerAmountLabel(view: CallReceiptView): string {
  if (view.receipt?.commercialModel === 'account_aud') return formatCurrencyAmount(view.receipt.totalBuyerCharge)
  if (view.receipt?.commercialModel === 'seller_canary_x402') return formatCurrencyAmount(view.receipt.totalBuyerAuthorization)
  if (view.usage !== undefined) return formatCurrencyAmount(view.usage.amount)
  return 'Not recorded yet'
}

function ownerCallIdentityFacts(result: FoundCallStatus) {
  const context = result.ownerContext
  const recordedTool = context?.recordedTool.kind === 'available' ? context.recordedTool : undefined
  return [
    {
      label: 'Tool at Call',
      value: (
        <Link
          to="/tools/$toolRef"
          params={{ toolRef: result.toolRef }}
          className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {recordedTool?.name ?? 'Recorded Tool name unavailable'}
        </Link>
      ),
      ...(recordedTool === undefined ? {} : { definition: 'Name retained with the Call snapshot, not read from the current catalogue.' }),
    },
    {
      label: 'Provider at Call',
      value: recordedTool === undefined
        ? 'Recorded Provider details unavailable'
        : `${recordedTool.providerRef} (name not recorded)`,
    },
    {
      label: 'Agent (current label)',
      value: context === undefined || context === null
        ? 'Agent details unavailable'
        : context.agent.currentDisplayName ?? 'Current Agent name not available',
      ...(context === undefined || context === null ? {} : { definition: 'Current account-owned label; it may differ from the label at Call time.' }),
    },
    {
      label: 'Purpose',
      value: context === undefined || context === null
        ? 'Purpose unavailable from this receipt source'
        : 'Not recorded for this Call',
    },
  ] as const
}

function recordedAtLabel(view: CallReceiptView): ReactNode {
  if (view.usage !== undefined) {
    return <time dateTime={timestampIso(view.usage.observedAt)}>{formatUtcTimestamp(view.usage.observedAt)} UTC</time>
  }
  const issuedAt = view.receipt?.issuedAt
  if (issuedAt === undefined) return 'Not recorded yet'
  const timestamp = Date.parse(issuedAt)
  return Number.isFinite(timestamp)
    ? <time dateTime={issuedAt}>{formatUtcTimestamp(timestamp)} UTC</time>
    : issuedAt
}
