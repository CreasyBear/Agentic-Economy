import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import type { HomeLifecycleIssueAlertProps } from '../agent-access-home.contracts'

export function HomeLifecycleIssueAlert({
  issue,
  retryLabel,
  retryDisabled,
  onRetry,
}: HomeLifecycleIssueAlertProps) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{issue.title}</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>{issue.message}</p>
        {issue.correlationRef === undefined
          ? null
          : <AeCopyReference label="support reference" value={issue.correlationRef} />}
        {issue.retry === undefined ? null : (
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
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
