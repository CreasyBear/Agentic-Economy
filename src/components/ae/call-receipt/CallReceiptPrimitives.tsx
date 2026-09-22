import type { ReactNode } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { CallIssueView } from '@/modules/capability-execution/call-receipt-view'
import type { CallStatusPageActions } from '@/lib/call-recovery/call-status-page-types'

export const callReceiptTactilePressClassName =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type CallReceiptRefreshLabelMode = 'try_again' | 'refresh_status'

export function callReceiptRefreshLabel(
  _mode: CallReceiptRefreshLabelMode,
  pending: boolean,
): string {
  return pending ? 'Checking…' : 'Check status'
}

export function CallReceiptRef({ value }: Readonly<{ value: string }>) {
  return <AeCopyReference label="Call reference" value={value} copyFeedbackMs={2_000} />
}

export function CallReceiptFact({ label, value, children }: Readonly<{ label: string; value?: string; children?: ReactNode }>) {
  return <div className="grid min-w-0 gap-intra"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="break-words text-sm text-foreground">{children ?? value}</dd></div>
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
      className="grid gap-related rounded-xl border border-border bg-card p-4"
      aria-labelledby="call-receipt-issue-title"
    >
      <Badge variant="warning" className="w-fit">Needs attention</Badge>
      <h2 id="call-receipt-issue-title" className="text-base font-medium leading-snug tracking-tight text-foreground">
        {issue.title}
      </h2>
      <p className="text-sm text-foreground">{issue.whatHappened}</p>
      <p
        className={cn(
          'rounded-card border px-3 py-2 text-sm tabular-nums',
          moneyTone === 'success' && 'border-success-ring bg-success-subtle text-success-foreground',
          moneyTone === 'warning' && 'border-warning-ring bg-warning-subtle text-warning-foreground',
          moneyTone === 'neutral' && 'border-border bg-muted/40 text-foreground',
        )}
      >
        {issue.moneyMovement}
      </p>
      <p className="text-sm text-muted-foreground">{issue.userNext}</p>
      <details className="border-t border-border pt-intra">
        <summary className="min-h-touch cursor-pointer text-xs font-medium text-muted-foreground">What happens next</summary>
        <p className="pt-intra text-sm text-muted-foreground">{issue.automaticNext}</p>
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
      variant="outline"
      className={cn('min-h-touch w-fit', callReceiptTactilePressClassName)}
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
    <Alert role="status">
      <AlertTitle>Status refreshed</AlertTitle>
      <AlertDescription>{feedback.message}</AlertDescription>
    </Alert>
  )
}
