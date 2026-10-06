import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'

import type { McpOAuthStartPanelProps } from '../connection-handoff.contracts'
import '../ConnectionHandoffComposition.css'

export function McpOAuthStartPanel({
  sourceOriginLabel,
  beginBusy,
  cancelBusy,
  error,
  onBegin,
  onCancel,
}: McpOAuthStartPanelProps) {
  return (
    <div className="arc-market arc-connection-handoff">
      <p className="arc-connection-handoff-copy">
        Sign in to {sourceOriginLabel}. The Provider controls its consent screen; Agentic Economy stores the resulting connection securely and returns you to Add Tool.
      </p>
      {error === undefined ? null : (
        <AeAlert tone="danger" title="Sign in not started" role="alert">{error}</AeAlert>
      )}
      <div className="arc-connection-handoff-actions">
        <Button type="button" variant="primary" size="md" disabled={beginBusy} onClick={() => void onBegin()}>
          {beginBusy ? 'Opening sign in…' : 'Continue to sign in'}
        </Button>
        <Button type="button" variant="secondary" size="md" disabled={beginBusy || cancelBusy} onClick={() => void onCancel()}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
