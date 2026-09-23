import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import type { McpOAuthStartPanelProps } from '../connection-handoff.contracts'

export function McpOAuthStartPanel({
  sourceOriginLabel,
  beginBusy,
  cancelBusy,
  error,
  onBegin,
  onCancel,
}: McpOAuthStartPanelProps) {
  return (
    <div className="grid max-w-xl gap-5">
      <p className="text-sm text-muted-foreground">
        Sign in to {sourceOriginLabel}. The Provider controls its consent screen; AE stores the resulting connection securely and returns you to Add Tool.
      </p>
      {error === undefined ? null : (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Sign-in not started</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={beginBusy} onClick={() => void onBegin()}>
          {beginBusy ? 'Opening sign-in…' : 'Continue to sign in'}
        </Button>
        <Button type="button" variant="secondary" disabled={beginBusy || cancelBusy} onClick={() => void onCancel()}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
