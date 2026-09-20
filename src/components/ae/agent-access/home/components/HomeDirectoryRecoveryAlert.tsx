import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import type { HomeDirectoryRecoveryAlertProps } from '../agent-access-home.contracts'

export function HomeDirectoryRecoveryAlert({
  title,
  message,
  retryLabel,
  loading,
  onRetry,
}: HomeDirectoryRecoveryAlertProps) {
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button type="button" variant="secondary" disabled={loading} onClick={onRetry}>
          {retryLabel}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
