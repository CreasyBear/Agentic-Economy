import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
    <Alert className="arc-market arc-agent-recovery">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button type="button" variant="secondary" className="arc-agent-inline-action" disabled={loading} onClick={onRetry}>
          {retryLabel}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
