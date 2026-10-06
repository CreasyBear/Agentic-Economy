import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
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
    <AeAlert tone="danger" title={issue.title} className="arc-market arc-agent-recovery">
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
      </AeAlert>
  )
}
