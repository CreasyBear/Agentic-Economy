import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Button } from '@/components/arc/button/button'

import type { HomeDirectoryRecoveryAlertProps } from '../agent-access-home.contracts'
import '../AgentHomeComposition.css'

export function HomeDirectoryRecoveryAlert({
  title,
  message,
  retryLabel,
  loading,
  onRetry,
}: HomeDirectoryRecoveryAlertProps) {
  return (
    <AeAlert role="alert" tone="info" title={title} className="arc-market arc-agent-recovery">
        <p>{message}</p>
        <Button type="button" variant="secondary" className="arc-agent-inline-action" disabled={loading} onClick={onRetry}>
          {retryLabel}
        </Button>
      </AeAlert>
  )
}
