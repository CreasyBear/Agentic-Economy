import { AlertTriangleIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import type { CallIssueView } from '@/modules/capability-execution/call-receipt-view'
import type { CallStatusPageActions } from '@/lib/call-recovery/call-status-page-types'

export function CallReceiptRef({ value }: Readonly<{ value: string }>) {
  return <AeCopyReference label="reference" value={value} />
}

export function CallReceiptFact({ label, value, children }: Readonly<{ label: string; value?: string; children?: ReactNode }>) {
  return <div className="grid min-w-0 gap-intra"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="break-words text-sm text-foreground">{children ?? value}</dd></div>
}

export function CallReceiptIssue({ issue }: Readonly<{ issue: CallIssueView }>) {
  return (
    <Alert role="alert">
      <AlertTriangleIcon aria-hidden="true" />
      <AlertTitle>{issue.title}</AlertTitle>
      <AlertDescription>
        <AeFactList
          facts={[
            { label: "What happened", value: issue.whatHappened },
            { label: "Did money move?", value: issue.moneyMovement },
            { label: "What happens automatically", value: issue.automaticNext },
            { label: "What you can do", value: issue.userNext },
          ]}
        />
      </AlertDescription>
    </Alert>
  )
}

export function CallReceiptRefreshButton({ actions }: Readonly<{ actions: CallStatusPageActions }>) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-touch w-fit"
      disabled={actions.refreshPending === true}
      onClick={() => { void actions.onRefresh?.() }}
    >
      {actions.refreshPending === true ? 'Refreshing current status…' : 'Refresh current status'}
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
        moneyMovement: 'This failed action does not prove that money moved. The recorded before-and-after facts on this receipt remain authoritative.',
        automaticNext: 'No replacement Call was created automatically.',
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
