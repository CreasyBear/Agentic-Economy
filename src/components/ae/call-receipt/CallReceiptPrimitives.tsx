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
  mode: CallReceiptRefreshLabelMode,
  pending: boolean,
): string {
  if (pending) return mode === 'try_again' ? 'Trying again…' : 'Refreshing current status…'
  return mode === 'try_again' ? 'Try again' : 'Refresh current status'
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
      aria-labelledby="call-receipt-playbook-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-intra">
        <Badge variant="warning" className="w-fit">Diagnostic Playbook</Badge>
        <CallReceiptRef value={issue.retainedReference} />
      </div>
      <h2 id="call-receipt-playbook-title" className="text-lg font-semibold tracking-tight text-foreground">
        {issue.title}
      </h2>
      <div className="grid gap-related">
        <PlaybookSection title="What happened" body={issue.whatHappened} />
        <PlaybookSection
          title="Financial impact"
          body={(
            <p
              className={cn(
                'rounded-lg border px-3 py-2 text-sm tabular-nums',
                moneyTone === 'success' && 'border-success-ring bg-success-subtle text-success-foreground',
                moneyTone === 'warning' && 'border-warning-ring bg-warning-subtle text-warning-foreground',
                moneyTone === 'neutral' && 'border-border bg-muted/40 text-foreground',
              )}
            >
              {issue.moneyMovement}
            </p>
          )}
        />
        <PlaybookSection title="What happens automatically" body={issue.automaticNext} />
        <PlaybookSection title="What you can do" body={issue.userNext} />
        {issue.remedyCertificate !== undefined ? (
          <div className="rounded-lg border border-brand/20 bg-brand/5 p-3 text-xs text-foreground">
            <div className="flex items-center justify-between pb-1 font-semibold text-brand">
              <span>Autonomous Buyer Protection Certificate</span>
              <Badge variant="outline" className="border-brand/40 text-[10px] text-brand">
                {issue.remedyCertificate.decisionTier}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-muted-foreground">
              <div>Adjudicator: <span className="font-medium text-foreground">{issue.remedyCertificate.adjudicator}</span></div>
              <div>Confidence: <span className="font-medium text-foreground">{(issue.remedyCertificate.confidence * 100).toFixed(0)}%</span></div>
              <div className="col-span-2">Hold Status: <span className="font-medium text-success-foreground">A$0.00 Net — Formance hold released immediately</span></div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function PlaybookSection({ title, body }: Readonly<{ title: string; body: ReactNode }>) {
  return (
    <div className="grid gap-intra">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="text-sm text-foreground">{body}</div>
    </div>
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
