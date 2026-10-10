import type { ReactNode } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Button } from '@/components/arc/button/button'
import './ReceiptComposition.css'

import type { CallIssueView } from '@/modules/capability-execution/call-receipt-view'
import type { CallStatusPageActions } from '@/lib/call-recovery/call-status-page-types'

export type CallReceiptRefreshLabelMode = 'try_again' | 'refresh_status'

export function callReceiptRefreshLabel(
  _mode: CallReceiptRefreshLabelMode,
  pending: boolean,
): string {
  return pending ? 'Checking…' : 'Check status'
}

export function CallReceiptRef({
  value,
  label = 'Call reference',
}: Readonly<{ value: string; label?: string }>) {
  return <AeCopyReference label={label} value={value} copyFeedbackMs={2_000} />
}

export function CallReceiptFact({ label, value, children }: Readonly<{ label: string; value?: string; children?: ReactNode }>) {
  return <div className="arc-market arc-call-fact"><dt>{label}</dt><dd>{children ?? value}</dd></div>
}

function financialImpactTone(moneyMovement: string): 'success' | 'warning' | 'neutral' {
  if (moneyMovement.includes('not yet conclusive') || moneyMovement.includes('cannot be confirmed')) return 'warning'
  if (moneyMovement.includes('A$0.00') || moneyMovement.includes('released back to your balance')) return 'success'
  return 'neutral'
}

export function CallReceiptIssue({ issue }: Readonly<{ issue: CallIssueView }>) {
  const moneyTone = financialImpactTone(issue.moneyMovement)
  return (
    <section
      role="alert"
      className="arc-market arc-call-issue"
      aria-labelledby="call-receipt-issue-title"
    >
      <AeStatusBadge status="needs_attention" density="cell" />
      <h2 id="call-receipt-issue-title" className="arc-call-heading">
        {issue.title}
      </h2>
      <p className="text-sm text-foreground">{issue.whatHappened}</p>
      <p className="arc-call-money-impact" data-tone={moneyTone}>
        {issue.moneyMovement}
      </p>
      <p className="arc-call-context">{issue.userNext}</p>
      <details className="arc-call-disclosure">
        <summary>What happens next</summary>
        <p className="arc-call-context">{issue.automaticNext}</p>
        <CallReceiptRef value={issue.retainedReference} />
      </details>
    </section>
  )
}

export function CallReceiptRefreshButton({
  actions,
  labelMode = 'refresh_status',
}: Readonly<{ actions: CallStatusPageActions; labelMode?: CallReceiptRefreshLabelMode }>) {
  const pending = actions.refreshPending === true
  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="arc-market w-fit"
      disabled={pending}
      onClick={() => { void actions.onRefresh?.() }}
    >
      {callReceiptRefreshLabel(labelMode, pending)}
    </Button>
  )
}

export function CallReceiptStatusFeedback({
  feedback,
  callRef,
}: Readonly<{ feedback?: CallStatusPageActions['feedback']; callRef: string }>) {
  if (feedback === undefined) return null
  if (feedback.kind === 'error') {
    return (
      <CallReceiptIssue issue={{
        title: 'The requested receipt action did not complete',
        whatHappened: feedback.message,
        moneyMovement: 'Money movement is not yet conclusive — do not assume a charge or refund.',
        automaticNext: 'No duplicate charge and no automatic retry.',
        userNext: 'Follow only the recovery action supported by the current receipt state, or reload this same receipt.',
        retainedReference: callRef,
      }} />
    )
  }
  return (
    <AeAlert tone="info" title="Status refreshed" role="status" className="arc-market arc-call-status-feedback">{feedback.message}</AeAlert>
  )
}
