import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/arc/button/button'

import type { HomeLifecycleIssueAlertProps } from '../agent-access-home.contracts'
import '../AgentHomeComposition.css'

export function HomeLifecycleIssueAlert({
  issue,
  retryLabel,
  retryDisabled,
  onRetry,
}: HomeLifecycleIssueAlertProps) {
  return (
    <Alert variant="destructive" className="arc-market arc-agent-recovery">
      <AlertTitle>{issue.title}</AlertTitle>
      <AlertDescription>
        <p>{issue.message}</p>
        {issue.correlationRef === undefined
          ? null
          : <AeCopyReference label="support reference" value={issue.correlationRef} />}
        {issue.retry === undefined ? null : (
          <Button
            type="button"
            variant="secondary"
            className="arc-agent-inline-action"
            disabled={retryDisabled}
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
